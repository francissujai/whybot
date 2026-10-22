// Carryover compression cascade (Markovian spec section 4.3), in strict order:
//   1. marker state the model wrote itself (>= 24 chars and within budget)
//   2. LLM compression via compressorFn
//   3. key-phrase heuristic
//   4. tail truncation to the budget
// Each level falls through on failure so a flaky model never breaks the chain.

import { estimateTokens } from "./types.ts";

export type CascadeLevel = "marker" | "llm" | "heuristic" | "truncation";

const KEY_PHRASE = /(?:^|\n)\s*((?:COMPLETED|REMAINING|DECISIONS|CONTEXT|Status|Decision|Next|Finding)\b[^\n]*)/gi;

export async function nextCarryover(args: {
  markerState?: string;
  previousCarryover: string;
  chunkText: string;
  budget: number;
  compressorFn?: (prompt: string, systemPrompt: string) => Promise<string>;
}): Promise<{ carryover: string; level: CascadeLevel }> {
  const { budget } = args;
  const fits = (s: string) => s.length >= 24 && estimateTokens(s) <= budget;

  if (args.markerState !== undefined) {
    const s = args.markerState.replace(/[<>[\]@-]{3,}/g, "").trim();
    if (fits(s)) return { carryover: s, level: "marker" };
  }

  if (args.compressorFn) {
    try {
      const prompt =
        `Previous state:\n${args.previousCarryover || "(none)"}\n\nLatest chunk (tail):\n${(args.markerState ?? args.chunkText).slice(-3000)}\n\n` +
        `Rewrite the state in at most ${Math.floor(budget * 3)} characters as:\nCOMPLETED: ...\nREMAINING: ...\nDECISIONS: ...\nCONTEXT: ...\n` +
        `Keep every evidence id like [E3] and every number that supports a decision.`;
      const s = (await args.compressorFn(prompt, "You compress investigation state. Be terse. Never drop a decision or an evidence id.")).trim();
      if (fits(s)) return { carryover: s, level: "llm" };
    } catch {
      // fall through
    }
  }

  const phrases = [...args.chunkText.matchAll(KEY_PHRASE)].map((m) => m[1].trim()).slice(0, 8);
  const summary = phrases.join("\n");
  if (phrases.length && estimateTokens(summary) <= budget) return { carryover: summary, level: "heuristic" };

  const words = (args.chunkText || args.previousCarryover).split(/\s+/).filter(Boolean);
  let tail = "";
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = words[i] + (tail ? " " + tail : "");
    if (estimateTokens(candidate) > budget) break;
    tail = candidate;
  }
  return { carryover: tail, level: "truncation" };
}
