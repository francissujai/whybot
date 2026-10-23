// One investigation, start to finish: recall memory, run the Markovian
// investigation, write the report, store findings, save artifacts. Used by
// the CLI and the web UI, which differ only in how they show the events.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../env.ts";
import { MeterlessProvider, ReceiptLog } from "../llm/meterless.ts";
import { ZetarisClient } from "../zetaris/client.ts";
import { asOf } from "./catalog.ts";
import { EvidenceLedger } from "./evidence.ts";
import { investigate } from "./investigator.ts";
import { learn, openMemory, recall } from "./memory.ts";
import { checkCitations, renderHtml, writeReport } from "./report.ts";

export const RUNS_DIR = path.join(ROOT, "runs");

export type SessionEvent =
  | { type: "start"; runId: string; question: string; model: string; provider: string }
  | { type: "memory"; recalled: { id: string; content: string }[] }
  | { type: "call"; purpose: string; seconds: number; model?: string; kind?: string; tokensIn?: number; tokensOut?: number; error?: string }
  | { type: "query"; id: string; hypothesis: string; purpose: string; rows: number; error?: string }
  | { type: "guard"; message: string }
  | { type: "step"; step: number; promptTokens?: number; state: string }
  | { type: "report"; markdown: string; cited: number; unknown: number; uncited: number }
  | { type: "done"; runId: string; status: string; seconds: number; steps: number; queries: number; reportPath?: string; served: string[] }
  | { type: "error"; message: string };

export async function runSession(question: string, opts: { useMemory?: boolean; onEvent?: (e: SessionEvent) => void } = {}) {
  const emit = (e: SessionEvent) => opts.onEvent?.(e);
  const llm = new ReceiptLog(new MeterlessProvider());
  llm.onCall = (c) =>
    emit({ type: "call", purpose: c.purpose, seconds: c.ms / 1000, model: c.route?.label, kind: c.route?.kind, tokensIn: c.usage?.promptTokens, tokensOut: c.usage?.completionTokens, error: c.error });
  const ledger = new EvidenceLedger(new ZetarisClient());
  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "question.txt"), question);
  emit({ type: "start", runId, question, model: llm.model, provider: llm.name });

  const mem = opts.useMemory === false ? undefined : openMemory();
  const { context, recalled } = mem ? recall(mem, question) : { context: "", recalled: [] };
  emit({ type: "memory", recalled: recalled.map((m) => ({ id: m.id, content: m.content })) });

  const inv = await investigate({
    question,
    llm,
    ledger,
    memoryContext: context || undefined,
    historyDir: RUNS_DIR,
    events: {
      onQuery: (q) => emit({ type: "query", id: q.id, hypothesis: q.hypothesis, purpose: q.purpose, rows: q.rows, error: q.error }),
      onGuard: (message) => emit({ type: "guard", message }),
      onChunk: (c, state) => emit({ type: "step", step: c.id, promptTokens: c.promptTokens, state }),
    },
  });

  const save = () => {
    fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(inv.run, null, 2));
    fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify(ledger.items, null, 2));
    fs.writeFileSync(path.join(dir, "receipts.json"), JSON.stringify(llm.calls, null, 2));
  };
  const served = () => llm.summary().filter((r) => r.calls && r.label !== r.model).map((r) => `${r.label} (${r.provider}, ${r.kind}): ${r.calls} calls`);
  const base = { type: "done" as const, runId, seconds: inv.run.durationMs / 1000, steps: inv.run.chunks.length, queries: ledger.items.length };

  if (!inv.run.chunks.length) {
    save();
    emit({ type: "error", message: inv.run.error ?? "no investigation steps completed" });
    emit({ ...base, status: inv.run.status, served: served() });
    return { runId, dir, inv, ok: false };
  }

  const report = await writeReport(inv, llm.as("report"));
  const check = checkCitations(report, ledger.items);
  const w = asOf();
  const written = mem ? learn(mem, inv, runId, `Week ${w.lastWeek[0]}..${w.lastWeek[1]}`) : [];
  fs.writeFileSync(path.join(dir, "report.md"), `# ${question}\n\n${report}\n`);
  fs.writeFileSync(path.join(dir, "report.html"), renderHtml(inv, report, check, { provider: llm.name, model: llm.model, recalled, written, receipts: llm.summary() }));
  save();
  emit({ type: "report", markdown: report, cited: check.cited.length, unknown: check.unknown.length, uncited: check.uncitedNumbers.length });
  emit({ ...base, status: inv.run.status, reportPath: path.join(dir, "report.html"), served: served() });
  return { runId, dir, inv, ok: inv.run.status === "completed" };
}

/** Past runs that produced a report, newest first. */
export function listRuns(): { runId: string; question: string }[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs
    .readdirSync(RUNS_DIR)
    .filter((d) => fs.existsSync(path.join(RUNS_DIR, d, "report.html")))
    .sort()
    .reverse()
    .map((runId) => {
      const q = path.join(RUNS_DIR, runId, "question.txt");
      const md = path.join(RUNS_DIR, runId, "report.md");
      const question = fs.existsSync(q) ? fs.readFileSync(q, "utf-8") : (fs.readFileSync(md, "utf-8").match(/^# (.+)$/m)?.[1] ?? runId);
      return { runId, question };
    });
}
