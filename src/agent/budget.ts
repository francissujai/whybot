// Token budget for the model lane. Cloud lanes have huge windows; a local
// lane on a 16 GB GPU may have only 10k tokens of context, which must hold
// the prompt, Nemotron's hidden reasoning and the answer. Set
// WHYBOT_CONTEXT_TOKENS to the lane's ctx (for example 10000) to turn on
// compact mode: smaller result previews, fewer queries per call, and an
// output cap sized to what is left after the prompt.

import { env } from "../env.ts";
import type { ChatMessage } from "../llm/meterless.ts";

export const CONTEXT_TOKENS = Number(env("WHYBOT_CONTEXT_TOKENS", "0")) || 0;
export const COMPACT = CONTEXT_TOKENS > 0 && CONTEXT_TOKENS <= 16_000;

export const PREVIEW_ROWS = COMPACT ? 12 : 25;
export const MAX_QUERIES_PER_CHUNK = COMPACT ? 2 : 3;
export const REPORT_EVIDENCE_ROWS = COMPACT ? 6 : 12;
export const REPORT_NOTE_CHARS = COMPACT ? 400 : 700;

const DEFAULT_MAX_OUTPUT = 5000;
const MIN_OUTPUT = 1500; // below this Nemotron's reasoning leaves no room for an answer
// Measured on Nemotron via Nightshift: ~2.2 chars per token for this prompt mix
// (SQL, CSV, markdown). chars/4 undercounts by about 1.5x.
const CHARS_PER_TOKEN = 2.2;

export const estimateTokens = (messages: ChatMessage[]) => Math.ceil(messages.reduce((s, m) => s + m.content.length + 16, 0) / CHARS_PER_TOKEN);

/** Output cap for one call: everything the context has left after the prompt. */
export function outputBudget(messages: ChatMessage[], cap = DEFAULT_MAX_OUTPUT): number {
  if (!CONTEXT_TOKENS) return cap;
  return Math.max(MIN_OUTPUT, Math.min(cap, CONTEXT_TOKENS - estimateTokens(messages) - 256));
}

/**
 * When the conversation inside a chunk outgrows the context, shrink older
 * query results to their first rows. The newest result stays whole; the
 * full rows are always kept in the evidence ledger.
 */
export function fitMessages(messages: ChatMessage[]): ChatMessage[] {
  if (!CONTEXT_TOKENS) return messages;
  const limit = CONTEXT_TOKENS - MIN_OUTPUT - 256;
  const out = messages.map((m) => ({ ...m }));
  for (let i = 0; i < out.length - 1 && estimateTokens(out) > limit; i++) {
    if (out[i].role !== "user" || !out[i].content.includes("<result")) continue;
    out[i].content = out[i].content.replace(/(<result[^>]*>\n(?:[^\n]*\n){0,5})[\s\S]*?(<\/result>)/g, "$1... (trimmed to fit the context; full rows are in the evidence ledger)\n$2");
  }
  return out;
}
