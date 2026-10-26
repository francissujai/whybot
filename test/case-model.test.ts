// The case model turns the server's event stream into hypotheses, evidence, steps and verdicts (web/src/caseModel.ts).

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCase, caseAt, classifyVerdict, formatClock, parseInline, parseMarkdown, parseVerdicts, type SessionEvent, type TimedEvent } from "../web/src/caseModel.ts";

const REPORT = `## Answer
Signups fell 18%, but about half of that is a tracking break [E1, E2].

## What explains the change
| Cause | Real or measurement | Effect on the metric | Verdict | Evidence |
|---|---|---|---|---|
| Release 4.12.0 broke the mobile signup event | Measurement | about half the drop | Measurement, not business | [E2] |
| Brand Search budget cut | Real | the rest of the drop | Confirmed | [E3] |

## Hypotheses ruled out
- Thanksgiving: one-day dip only [E4].
- Pricing: unchanged since June [E5].
`;

const events: SessionEvent[] = [
  { type: "start", runId: "2026-10-26T03-30-00", question: "Why did trial signups drop 18% last week?", model: "nemotron", provider: "meterless" },
  { type: "memory", recalled: [] },
  { type: "call", purpose: "step", seconds: 20.6, model: "m", kind: "local" },
  { type: "query", id: "E1", hypothesis: "Confirm the move", purpose: "Signups this week vs last", rows: 14 },
  { type: "step", step: 1, state: "E1: 2,160 -> 1,771" },
  { type: "call", purpose: "step", seconds: 22.9 },
  { type: "query", id: "E2", hypothesis: "Release / tracking break", purpose: "Mobile events vs submits", rows: 28 },
  { type: "query", id: "E3", hypothesis: "Ad budget change", purpose: "Brand Search budget", rows: 14 },
  { type: "step", step: 2, state: "E2, E3 recorded" },
  { type: "query", id: "E4", hypothesis: "Holiday", purpose: "Thanksgiving week", rows: 7 },
  { type: "query", id: "E5", hypothesis: "pricing  change", purpose: "Price history", rows: 3 },
  { type: "step", step: 3, state: "E4, E5 recorded" },
  { type: "call", purpose: "report", seconds: 24.8 },
  { type: "report", markdown: REPORT, cited: 5, unknown: 0, uncited: 0 },
  { type: "done", runId: "2026-10-26T03-30-00", status: "completed", seconds: 97, steps: 3, queries: 5, reportPath: "report.html", served: [] },
];

test("a run becomes steps, evidence and one card per hypothesis", () => {
  const c = buildCase(events);
  assert.equal(c.status, "done");
  assert.equal(c.question, "Why did trial signups drop 18% last week?");
  assert.deepEqual(c.steps.map((s) => s.evidence.map((e) => e.id)), [["E1"], ["E2", "E3"], ["E4", "E5"]]);
  assert.equal(c.steps[0].calls.length, 1);
  assert.equal(c.reportCalls.length, 1);
  assert.equal(c.hypotheses.length, 5);
  assert.deepEqual(c.hypotheses.find((h) => h.name === "Release / tracking break")?.evidence, ["E2"]);
});

test("verdicts come from the report's cause table and its ruled-out list", () => {
  const byName = Object.fromEntries(buildCase(events).hypotheses.map((h) => [h.name, h.verdict]));
  assert.equal(byName["Release / tracking break"], "measurement");
  assert.equal(byName["Ad budget change"], "confirmed");
  assert.equal(byName["Holiday"], "ruled-out");
  assert.equal(byName["pricing  change"], "ruled-out");
  assert.equal(byName["Confirm the move"], null, "evidence the report does not judge stays unjudged");
  assert.deepEqual(parseVerdicts(REPORT).map((v) => v.id), ["E2", "E3", "E4", "E5"]);
});

test("verdict wording maps to the four verdicts", () => {
  assert.equal(classifyVerdict("Measurement, not business"), "measurement");
  assert.equal(classifyVerdict("Ruled out: no measurable effect"), "ruled-out");
  assert.equal(classifyVerdict("Confirmed, real loss"), "confirmed");
  assert.equal(classifyVerdict("Partly"), "unclear");
});

test("a failed or aborted run is failed; the step limit still counts as done", () => {
  const start = events[0];
  assert.equal(buildCase([start, { type: "error", message: "MODEL_API_KEY is missing from .env" }]).status, "failed");
  assert.equal(buildCase([start, { type: "done", runId: "r", status: "aborted", seconds: 1, steps: 0, queries: 0, served: [] }]).status, "failed");
  assert.equal(buildCase([start, { type: "done", runId: "r", status: "max-chunks", seconds: 1, steps: 6, queries: 6, served: [] }]).status, "done");
  const both = buildCase([start, { type: "error", message: "boom" }, { type: "done", runId: "r", status: "errored", seconds: 1, steps: 0, queries: 0, served: [] }]);
  assert.equal(both.error, "boom", "the first error message is kept");
});

test("markdown: headings, paragraphs, tables and lists", () => {
  const blocks = parseMarkdown(REPORT);
  assert.deepEqual(blocks.map((b) => b.kind), ["heading", "para", "heading", "table", "heading", "list"]);
  const table = blocks[3];
  assert.ok(table.kind === "table" && table.header.length === 5 && table.rows.length === 2);
});

test("inline markdown finds evidence references, bold and italics", () => {
  const parts = parseInline("Fell **18%** [E1, E2] and then *rebounded* [E3].");
  assert.deepEqual(parts.map((p) => p.kind), ["text", "strong", "text", "ref", "text", "em", "text", "ref", "text"]);
  const ref = parts[3];
  assert.ok(ref.kind === "ref");
  assert.deepEqual(ref.kind === "ref" && ref.ids, ["E1", "E2"]);
});

test("a replay shows the case as it was at a point in time", () => {
  const timed: TimedEvent[] = events.map((e, i) => ({ t: i * 1000, e }));
  assert.equal(caseAt(timed, 0).evidence.length, 0);
  assert.equal(caseAt(timed, 3000).evidence.length, 1);
  assert.equal(caseAt(timed, 3000).hypotheses[0].verdict, null);
  const end = caseAt(timed, 99_000);
  assert.equal(end.status, "done");
  assert.equal(end.hypotheses.filter((h) => h.verdict).length, 4);
  assert.equal(formatClock(95_000), "1:35");
});
