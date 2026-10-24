// The WhyBot investigation loop, powered by the Markovian engine.
//
// One chunk = one investigation step: quantify the move and list hypotheses,
// or test one hypothesis with up to MAX_QUERIES_PER_CHUNK queries and give a
// verdict. Inside a chunk the model calls the Zetaris SQL tool with a
// <sql> block; WhyBot runs it, stores the result in the evidence ledger, and
// shows the model a preview. Between chunks only the carryover state
// (verdicts + evidence ids) survives, so the prompt stays the same size no
// matter how many hypotheses get tested.

import { Markovian } from "../engines/markovian/index.ts";
import type { ChunkInfo, Generator, MarkovianRun, Usage } from "../engines/markovian/index.ts";
import type { ChatMessage, ChatProvider } from "../llm/meterless.ts";
import { asOf, CATALOG, SQL_RULES } from "./catalog.ts";
import { EvidenceLedger } from "./evidence.ts";
import { calibrate, fitMessages, MAX_QUERIES_PER_CHUNK, outputBudget } from "./budget.ts";

export { MAX_QUERIES_PER_CHUNK } from "./budget.ts";
/** State compression model; defaults to the main lane (NEMOTRON_MODEL). */
export const COMPRESSOR_MODEL = process.env.WHYBOT_COMPRESSOR_MODEL?.trim() || undefined;

export function systemPrompt(): string {
  const w = asOf();
  return `You are WhyBot, a data investigator. You explain why a business metric moved, using only evidence from SQL you run through Zetaris.

TODAY is ${w.today}. "Last week" = ${w.lastWeek[0]} to ${w.lastWeek[1]} (Mon-Sun). "The week before" = ${w.priorWeek[0]} to ${w.priorWeek[1]}.

DATA
${CATALOG}

${SQL_RULES}

HOW TO RUN QUERIES: write every query this step needs (1 to ${MAX_QUERIES_PER_CHUNK} blocks) in ONE reply, then STOP and wait:
<sql hypothesis="H2" purpose="mobile vs desktop tracked signups by day">
SELECT ...
</sql>
Always fill in both attributes: hypothesis (H0 while quantifying, else H1..Hn) and a short purpose.
You get back one <result id="E7" rows="14">csv</result> per block. Cite them as [E7]. Model calls are slow, so plan the step's queries together.
Never write a <result> yourself and never guess a number before the result arrives.

METHOD
- Do arithmetic in SQL, never in your head: weekly totals, differences and percent changes must come back as columns of a result (for example a CASE that buckets dates into 'prior' and 'last' weeks, and a percent-change column).
- Chunk 1 quantifies only: query weekly totals and percent change (H0), then the same split by device and channel. List 4-6 competing hypotheses H1..Hn spanning different sources: ad platform changes, product releases and tracking, pricing, seasonality and holidays, real demand. Do not give verdicts in chunk 1.
- Each later chunk tests ONE hypothesis with a decisive query and gives a verdict: SUPPORTED (with the size of its effect), RULED OUT, or INCONCLUSIVE, citing evidence ids.
- Check measurement before blaming demand: compare the dashboard metric with the backend source of truth for the same weeks and segments. A gap between them is a measurement change, not a business change.
- Size every effect. A cause is SUPPORTED only if it moves the metric by a material share of the total change over the same period; a cause confined to one day cannot explain a week-long drop on its own.
- Trace every SUPPORTED cause to a specific event: the release (version, component, time) from app_pg.release_log or the ad change (campaign, change, old -> new value, time) from ads_pg.ad_change_log. Confirm the timing with a daily series around that event. Judge each change separately; two changes on nearby days are two hypotheses, not one.
- Quantify how much of the total change each supported cause explains, and say what is left unexplained.
- Never state a number that is not in a result you received.
- When every hypothesis has a verdict and the parts add up, write a 3-5 sentence conclusion and end with [TASK_COMPLETE].
- Be brief. Every chunk ends within 250 words of prose.

STATE BLOCK after [STATE_CHECKPOINT] (keep it under 150 words):
COMPLETED: H1 <name>: <verdict>, <key numbers> [E#]; ...
REMAINING: H4 <name>; ...
DECISIONS: metric definitions and baselines you settled on
CONTEXT: the total change [E#] and anything the next step needs`;
}

const SQL_BLOCK_G = /<sql(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/sql>/gi;
const attr = (attrs: string, name: string) => attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? "";

/**
 * Hypothesis and purpose for the evidence ledger. Prefer the tag attributes;
 * otherwise use a leading SQL comment, the last Hn the model mentioned before
 * the block, and finally the tables the query reads.
 */
export function labelQuery(attrs: string, before: string, sql: string): { hypothesis: string; purpose: string } {
  const comment = sql.match(/^\s*--\s*(.+)$/m)?.[1]?.trim() ?? "";
  const hypothesis = attr(attrs, "hypothesis") || comment.match(/\bH\d+\b/)?.[0] || [...before.matchAll(/\bH\d+\b/g)].at(-1)?.[0] || "H0";
  const tables = [...new Set([...sql.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/gi)].map((t) => t[1].toLowerCase()))];
  const purpose = attr(attrs, "purpose") || comment.replace(/^H\d+\s*[:\-–]\s*/, "") || `read ${tables.join(", ") || "data"}`;
  return { hypothesis, purpose: purpose.slice(0, 120) };
}

export interface InvestigationEvents {
  onQuery?: (e: { id: string; hypothesis: string; purpose: string; rows: number; error?: string; chunk: number }) => void;
  onChunk?: (chunk: ChunkInfo, carryover: string) => void;
  onGuard?: (message: string) => void;
}

/** Wraps the chat provider into a Markovian generator that can call the SQL tool. */
export function makeInvestigatorGenerator(llm: ChatProvider, ledger: EvidenceLedger, events: InvestigationEvents = {}): Generator {
  let chunkNo = 0;
  return async (prompt, _attachments, system, _onStream, signal) => {
    chunkNo++;
    const messages: ChatMessage[] = [
      { role: "system", content: system ?? systemPrompt() },
      { role: "user", content: prompt },
    ];
    const usage: Usage = { promptTokens: 0, completionTokens: 0 };
    let measured = true;
    const log: string[] = [];
    let final = "";

    const ask = async () => {
      let r;
      try {
        const fitted = fitMessages(messages);
        r = await llm.chat(fitted, { maxTokens: outputBudget(fitted), signal });
      } catch (err) {
        // One more try after a pause; the provider already retried transient errors.
        if (signal?.aborted) throw err;
        await new Promise((res) => setTimeout(res, 15_000));
        const fitted = fitMessages(messages);
        r = await llm.chat(fitted, { maxTokens: outputBudget(fitted), signal });
      }
      if (r.usage) calibrate(fitMessages(messages), r.usage.promptTokens);
      if (r.usage) {
        usage.promptTokens += r.usage.promptTokens;
        usage.completionTokens += r.usage.completionTokens;
      } else measured = false;
      return r.text;
    };

    // Each model call may carry several <sql> blocks; they run together and all
    // results go back in one message. Calls are the slow part, queries are not.
    let used = 0;
    for (let round = 0; ; round++) {
      const reply = await ask();
      const blocks = [...reply.matchAll(SQL_BLOCK_G)];
      if (!blocks.length || used >= MAX_QUERIES_PER_CHUNK) {
        final = blocks.length ? reply.slice(0, blocks[0].index).trim() : reply;
        break;
      }
      const take = blocks.slice(0, MAX_QUERIES_PER_CHUNK - used);
      const previews: string[] = [];
      for (const b of take) {
        const { hypothesis, purpose } = labelQuery(b.groups!.attrs, reply.slice(0, b.index), b.groups!.body);
        const ev = await ledger.run(b.groups!.body, hypothesis, purpose);
        events.onQuery?.({ id: ev.id, hypothesis, purpose, rows: ev.rowCount, error: ev.error, chunk: chunkNo });
        log.push(`>> [${ev.id}] ${hypothesis}: ${purpose}${ev.error ? " (query failed)" : ` (${ev.rowCount} rows)`}`);
        previews.push(EvidenceLedger.preview(ev));
      }
      used += take.length;
      // Carry back only the queries, not the model's prose around them: it adds
      // tokens and nothing the next call needs.
      messages.push({ role: "assistant", content: take.map((b) => b[0]).join("\n") });
      const failed = previews.some((p) => p.includes('error="true"'));
      const next =
        used >= MAX_QUERIES_PER_CHUNK || !failed
          ? "Now give your verdict for this step and end with the state block. Only write another <sql> block if a query failed and must be fixed."
          : "One or more queries failed: fix them in one reply, or give your verdict now.";
      messages.push({ role: "user", content: `${previews.join("\n")}\n${next}` });
    }
    if (!/\[STATE_CHECKPOINT\]|\[TASK_COMPLETE\]/.test(final)) {
      messages.push({ role: "assistant", content: final });
      messages.push({ role: "user", content: "End this chunk now: [STATE_CHECKPOINT] with the state block, or [TASK_COMPLETE] if every hypothesis has a verdict." });
      final += "\n" + (await ask());
    }
    // Completion guard: [TASK_COMPLETE] only counts as the last word, once every hypothesis has a verdict.
    final = stripInlineCompletion(final);
    if (/\[TASK_COMPLETE\]/.test(final)) {
      const gap = completionGap(`${prompt}\n${final}`);
      if (gap) {
        events.onGuard?.(`chunk ${chunkNo}: completion refused, ${gap}`);
        messages.push({ role: "assistant", content: final });
        messages.push({
          role: "user",
          content: `Not finished: ${gap} Do not write [TASK_COMPLETE]. End this chunk with [STATE_CHECKPOINT] and list every untested hypothesis under REMAINING; each gets its own later step.`,
        });
        const redo = (await ask()).replace(/\[TASK_COMPLETE\]/g, "").replace(/<sql[\s\S]*?(<\/sql>|$)/gi, "").trim();
        if (/\[STATE_CHECKPOINT\]/.test(redo)) final = redo;
        else {
          // No usable state from the model: keep the previous state and record what is missing.
          const previous = prompt.match(/\[CARRYOVER STATE\]\n([\s\S]*?)\n\n/)?.[1] ?? "";
          final = `${final.replace(/\[TASK_COMPLETE\]/g, "").trim()}\n[STATE_CHECKPOINT]\n${previous}\nREMAINING (guard): ${gap}`.trim();
        }
      }
    }
    return { text: [...log, final].join("\n"), metadata: measured ? { usage } : undefined };
  };
}

/**
 * A verdict is "H3 <label>: RULED OUT" or "H3 SUPPORTED". A plan such as
 * "Test H2 (tracking): query ... verdict SUPPORTED or RULED OUT" does not count.
 */
const VERDICT_FOR = /\bH([1-9]\d?)\b[^;\n:]{0,80}[:\s]\s*\**\s*(SUPPORTED|RULED OUT|INCONCLUSIVE)\b/gi;

/** [TASK_COMPLETE] only counts as the chunk's last word, not when quoted inside a plan. */
export function stripInlineCompletion(text: string): string {
  const t = text.trimEnd();
  const at = t.lastIndexOf("[TASK_COMPLETE]");
  if (at < 0) return text;
  const isLast = t.slice(at + "[TASK_COMPLETE]".length).trim().length === 0;
  const rest = t.slice(0, isLast ? at : t.length).replace(/\[TASK_COMPLETE\]/g, "the completion marker");
  return isLast ? `${rest}[TASK_COMPLETE]` : rest;
}

/** Why the investigation may not finish yet, or undefined when it may. */
export function completionGap(text: string): string | undefined {
  const mentioned = new Set([...text.matchAll(/\bH([1-9]\d?)\b/g)].map((m) => `H${m[1]}`));
  const verdicted = new Set([...text.matchAll(VERDICT_FOR)].map((m) => `H${m[1]}`));
  const missing = [...mentioned].filter((h) => !verdicted.has(h));
  if (verdicted.size < 3) return `only ${verdicted.size} hypotheses have a verdict${verdicted.size ? ` (${[...verdicted].join(", ")})` : ""}; test at least three competing hypotheses.`;
  if (missing.length) return `${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no verdict yet.`;
  return undefined;
}

export interface Investigation {
  question: string;
  run: MarkovianRun;
  ledger: EvidenceLedger;
}

export async function investigate(args: {
  question: string;
  llm: ChatProvider;
  ledger: EvidenceLedger;
  memoryContext?: string;
  maxChunks?: number;
  historyDir?: string;
  events?: InvestigationEvents;
  signal?: AbortSignal;
}): Promise<Investigation> {
  const engine = new Markovian({
    chunkConfig: { chunkSize: 6000, carryoverTokens: 700, maxChunks: args.maxChunks ?? 10 },
    historyDir: args.historyDir,
    compressorFn: async (prompt, system) =>
      (await args.llm.chat([{ role: "system", content: system }, { role: "user", content: prompt }], { maxTokens: 600, model: COMPRESSOR_MODEL })).text,
  });
  const run = await engine.run({
    goal: args.question,
    mode: "RESEARCH",
    systemPrompt: systemPrompt(),
    memoryContext: args.memoryContext,
    generator: makeInvestigatorGenerator(args.llm, args.ledger, args.events),
    onChunk: args.events?.onChunk,
    abortSignal: args.signal,
    reflect: false, // the report step plays this role and checks every citation
  });
  return { question: args.question, run, ledger: args.ledger };
}
