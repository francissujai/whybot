// Pure model of an investigation ("a case"): built from the event stream the server already sends, for a
// live run and a replay alike. No React and no imports, so the tests in test/ can load it directly.

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

export type Verdict = "confirmed" | "measurement" | "ruled-out" | "unclear";
export type CaseStatus = "idle" | "queued" | "running" | "done" | "failed";

export interface Evidence { id: string; hypothesis: string; purpose: string; rows: number; error?: string; step: number }
export interface Hypothesis { key: string; name: string; evidence: string[]; purposes: string[]; rows: number; verdict: Verdict | null }
export interface ModelCall { purpose: string; seconds: number; model?: string; kind?: string; error?: string }
export interface Step { step: number; evidence: Evidence[]; calls: ModelCall[]; state?: string }
export interface Case {
  status: CaseStatus;
  runId?: string; question?: string; model?: string; provider?: string;
  recalled: { id: string; content: string }[];
  hypotheses: Hypothesis[]; evidence: Evidence[]; steps: Step[]; guards: string[];
  reportCalls: ModelCall[];
  report?: { markdown: string; cited: number; unknown: number; uncited: number };
  seconds?: number; reportPath?: string; error?: string;
}

export const emptyCase = (): Case => ({ status: "idle", recalled: [], hypotheses: [], evidence: [], steps: [], guards: [], reportCalls: [] });

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Folds the events into a case. Queries and model calls belong to the step that ends with the next "step" event. */
export function buildCase(events: SessionEvent[]): Case {
  const c = emptyCase();
  const byKey = new Map<string, Hypothesis>();
  let pending: Step = { step: 1, evidence: [], calls: [] };
  const flush = (state?: string) => { c.steps.push({ ...pending, state }); pending = { step: c.steps.length + 1, evidence: [], calls: [] }; };

  for (const e of events) {
    switch (e.type) {
      case "start":
        c.status = "running"; c.runId = e.runId; c.question = e.question; c.model = e.model; c.provider = e.provider;
        break;
      case "memory": c.recalled = e.recalled; break;
      case "call": {
        const call = { purpose: e.purpose, seconds: e.seconds, model: e.model, kind: e.kind, error: e.error };
        if (e.purpose === "report") c.reportCalls.push(call);
        else pending.calls.push(call);
        break;
      }
      case "query": {
        const ev: Evidence = { id: e.id, hypothesis: e.hypothesis, purpose: e.purpose, rows: e.rows, error: e.error, step: pending.step };
        c.evidence.push(ev); pending.evidence.push(ev);
        const key = norm(e.hypothesis) || "untitled";
        const h = byKey.get(key) ?? { key, name: e.hypothesis.trim() || "Untitled hypothesis", evidence: [], purposes: [], rows: 0, verdict: null };
        h.evidence.push(e.id); h.purposes.push(e.purpose); h.rows += e.rows;
        byKey.set(key, h);
        break;
      }
      case "guard": c.guards.push(e.message); break;
      case "step": flush(e.state); break;
      case "report": c.report = { markdown: e.markdown, cited: e.cited, unknown: e.unknown, uncited: e.uncited }; break;
      case "done": {
        // "max-chunks" stops at the step limit but still writes a report; "errored" and "aborted" did not finish.
        const failed = e.status === "errored" || e.status === "aborted";
        if (failed) { c.status = "failed"; c.error ??= `The investigation ${e.status}.`; }
        else if (c.status !== "failed") c.status = "done";
        c.seconds = e.seconds; c.reportPath = e.reportPath;
        break;
      }
      case "error": c.status = "failed"; c.error = e.message; break;
    }
  }
  if (pending.evidence.length || pending.calls.length) c.steps.push({ ...pending });
  c.hypotheses = [...byKey.values()];
  if (c.report) applyVerdicts(c.hypotheses, c.report.markdown);
  return c;
}

/** Marks a case as queued before the first event arrives. */
export const queuedCase = (question: string): Case => ({ ...emptyCase(), status: "queued", question });

// ---------------------------------------------------------------- verdicts

export function classifyVerdict(text: string): Verdict {
  const t = text.toLowerCase();
  if (/measurement|tracking|instrument|not (a )?real|artifact|logging/.test(t)) return "measurement";
  if (/ruled out|rule[sd]? out|no (measurable )?effect|not the cause|not a cause|dismiss|rejected|did not|didn't/.test(t)) return "ruled-out";
  if (/confirm|real|explains|contribut|primary|driver|cause|yes/.test(t)) return "confirmed";
  return "unclear";
}

const evidenceIds = (s: string) => [...s.matchAll(/\bE\d+\b/g)].map((m) => m[0]);

/** Reads the report's cause table and its "ruled out" list, and gives each hypothesis the verdict of the row that cites its evidence. */
export function parseVerdicts(markdown: string): { id: string; verdict: Verdict }[] {
  const out: { id: string; verdict: Verdict }[] = [];
  const blocks = parseMarkdown(markdown);
  for (const b of blocks) {
    if (b.kind !== "table") continue;
    const head = b.header.map((h) => h.toLowerCase());
    const vi = head.findIndex((h) => h.includes("verdict"));
    if (vi < 0) continue;
    for (const row of b.rows) for (const id of evidenceIds(row.join(" "))) out.push({ id, verdict: classifyVerdict(row[vi] ?? "") });
  }
  let inRuledOut = false;
  for (const b of blocks) {
    if (b.kind === "heading") inRuledOut = /ruled out/i.test(b.text);
    else if (inRuledOut && b.kind === "list") for (const item of b.items) for (const id of evidenceIds(item)) out.push({ id, verdict: "ruled-out" });
  }
  return out;
}

function applyVerdicts(hs: Hypothesis[], markdown: string) {
  const found = parseVerdicts(markdown);
  for (const h of hs) {
    const hit = found.find((f) => h.evidence.includes(f.id));
    h.verdict = hit?.verdict ?? null;
  }
}

// ---------------------------------------------------------------- markdown (just what the report uses)

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] };

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isDivider = (line: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ kind: "heading", level: h[1].length, text: h[2].trim() }); i++; continue; }
    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = cells(line); const rows: string[][] = []; i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push({ kind: "table", header, rows }); continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, "").trim());
      blocks.push({ kind: "list", items }); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isDivider(lines[i + 1]))) para.push(lines[i++].trim());
    blocks.push({ kind: "para", text: para.join(" ") });
  }
  return blocks;
}

export type Inline = { kind: "text"; text: string } | { kind: "strong"; text: string } | { kind: "em"; text: string } | { kind: "ref"; ids: string[] };

/** Splits a line into text, bold, italic and evidence references like [E3] or [E1, E2]. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[((?:E\d+)(?:\s*[,;]\s*E\d+)*)\]|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: "ref", ids: evidenceIds(m[1]) });
    else if (m[2]) out.push({ kind: "strong", text: m[2] });
    else out.push({ kind: "em", text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

// ---------------------------------------------------------------- replay

export interface TimedEvent { t: number; e: SessionEvent }

/** The case as it stood `t` milliseconds into the run. */
export const caseAt = (items: TimedEvent[], t: number): Case => buildCase(items.filter((i) => i.t <= t).map((i) => i.e));
export const durationOf = (items: TimedEvent[]): number => items.reduce((m, i) => Math.max(m, i.t), 0);

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
