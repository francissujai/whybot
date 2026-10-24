// Offline tests: a scripted model and a fake SQL runner drive the real
// Markovian investigation loop, evidence ledger and report checks.

import assert from "node:assert/strict";
import { test } from "node:test";
import { EvidenceLedger } from "../src/agent/evidence.ts";
import { completionGap, investigate, labelQuery, stripInlineCompletion, makeInvestigatorGenerator, MAX_QUERIES_PER_CHUNK } from "../src/agent/investigator.ts";
import { lintSql } from "../src/zetaris/lint.ts";
import { checkCitations, markdownToHtml, renderHtml } from "../src/agent/report.ts";
import type { ChatMessage, ChatProvider, ChatResult } from "../src/llm/meterless.ts";
import { guardSql, normalise, type SqlRunner } from "../src/zetaris/client.ts";

class ScriptedLLM implements ChatProvider {
  readonly name = "scripted";
  readonly model = "scripted";
  calls: ChatMessage[][] = [];
  constructor(private replies: string[]) {}
  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    this.calls.push(messages.map((m) => ({ ...m })));
    const text = this.replies.shift();
    if (text === undefined) throw new Error("script exhausted");
    return { text, model: this.model, usage: { promptTokens: messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0), completionTokens: Math.ceil(text.length / 4) } };
  }
}

class FakeSql implements SqlRunner {
  seen: string[] = [];
  async run(sql: string) {
    this.seen.push(guardSql(sql));
    if (/broken/.test(sql)) throw new Error("Table or view not found: broken");
    return { columns: ["week", "signups"], rows: [["prior", 2160], ["last", 1771]], ms: 3 };
  }
}

const state = (c: string, r: string) => `[STATE_CHECKPOINT]\nCOMPLETED: ${c}\nREMAINING: ${r}\nDECISIONS: dashboard metric = trial_signups_daily\nCONTEXT: tracked -18% [E1]`;

test("investigation runs as bounded chunks, ledger records each query, context stays flat", async () => {
  const llm = new ScriptedLLM([
    // chunk 1: quantify, then hypotheses
    `<sql hypothesis="H0" purpose="weekly tracked signups">SELECT 1</sql>`,
    `Tracked signups fell from 2160 to 1771 [E1]. Hypotheses: H1 tracking, H2 ads.\n${state("H0 quantified [E1]", "H1 tracking; H2 ads")}`,
    // chunk 2: test H1 (with a failing query first)
    `<sql hypothesis="H1" purpose="bad table">SELECT * FROM broken</sql>`,
    `<sql hypothesis="H1" purpose="events by device">SELECT 2</sql>`,
    `H1 SUPPORTED [E3].\n${state("H1 tracking: SUPPORTED [E3]", "H2 ads")}`,
    // chunk 3: H2 and H3 and finish
    `<sql hypothesis="H2" purpose="brand spend">SELECT 3</sql>`,
    `H2 SUPPORTED [E4]\nH3 holiday RULED OUT [E1]\nConclusion: two causes. [TASK_COMPLETE]`,
  ]);
  const sql = new FakeSql();
  const ledger = new EvidenceLedger(sql);
  const inv = await investigate({ question: "Why did trial signups drop 18% last week?", llm, ledger });

  assert.equal(inv.run.status, "completed");
  assert.equal(inv.run.chunks.length, 3);
  assert.equal(inv.run.tokenLabel, "measured");
  assert.deepEqual(ledger.items.map((e) => e.id), ["E1", "E2", "E3", "E4"]);
  assert.ok(ledger.get("E2")?.error, "failed query is kept as evidence with its error");
  assert.match(inv.run.chunks[1].content, />> \[E2\] H1: bad table \(query failed\)/);
  assert.doesNotMatch(inv.run.output, /STATE_CHECKPOINT|TASK_COMPLETE/);

  // Chunk 3's first prompt carries the state, not the earlier transcript.
  const chunk3Prompt = llm.calls[5][1].content;
  assert.match(chunk3Prompt, /\[CARRYOVER STATE\][\s\S]*H1 tracking: SUPPORTED \[E3\]/);
  assert.doesNotMatch(chunk3Prompt, /bad table|Tracked signups fell/);
});

test("query budget per chunk is enforced and the chunk is forced to checkpoint", async () => {
  const replies = Array.from({ length: MAX_QUERIES_PER_CHUNK + 1 }, (_, i) => `<sql hypothesis="H1" purpose="q${i}">SELECT ${i}</sql>`);
  replies.push(state("H1 inconclusive", "H2"));
  const llm = new ScriptedLLM(replies);
  const ledger = new EvidenceLedger(new FakeSql());
  const gen = makeInvestigatorGenerator(llm, ledger);
  const out = await gen("goal", [], "system");
  assert.equal(ledger.items.length, MAX_QUERIES_PER_CHUNK);
  assert.match(out.text, /\[STATE_CHECKPOINT\]/);
});

test("several queries in one reply run together and cost one model round-trip", async () => {
  const llm = new ScriptedLLM([
    `Plan.\n<sql hypothesis="H0" purpose="totals">SELECT 1</sql>\n<sql hypothesis="H0" purpose="by device">SELECT 2</sql>`,
    state("H0 quantified [E1, E2]", "H1; H2; H3"),
  ]);
  const ledger = new EvidenceLedger(new FakeSql());
  const out = await makeInvestigatorGenerator(llm, ledger)("goal", [], "system");
  assert.equal(llm.calls.length, 2);
  assert.deepEqual(ledger.items.map((e) => e.purpose), ["totals", "by device"]);
  assert.match(llm.calls[1].at(-1)!.content, /<result id="E1"[\s\S]*<result id="E2"/);
  assert.match(out.text, /\[STATE_CHECKPOINT\]/);
});

test("premature [TASK_COMPLETE] is refused and turned into a checkpoint", async () => {
  const llm = new ScriptedLLM([
    `H1 tracking SUPPORTED [E1]. All done. [TASK_COMPLETE]`,
    `${state("H1 tracking: SUPPORTED [E1]", "H2 ads; H3 holiday")}`,
  ]);
  const guards: string[] = [];
  const seeded = new EvidenceLedger(new FakeSql());
  await seeded.run("SELECT 1", "H0", "seed");
  const gen = makeInvestigatorGenerator(llm, seeded, { onGuard: (m) => guards.push(m) });
  const out = await gen("User Request: why? Hypotheses H1 tracking, H2 ads, H3 holiday", [], "system");
  assert.equal(guards.length, 1);
  assert.match(guards[0], /only 1 hypotheses have a verdict/);
  assert.doesNotMatch(out.text, /TASK_COMPLETE/);
  assert.match(out.text, /\[STATE_CHECKPOINT\][\s\S]*REMAINING: H2 ads; H3 holiday/);
});

test("completion gap needs three verdicts and none missing", () => {
  assert.match(completionGap("H1 SUPPORTED; H2 RULED OUT") ?? "", /only 2/);
  assert.match(completionGap("H1 SUPPORTED; H2 RULED OUT; H3 INCONCLUSIVE; H4 pricing") ?? "", /H4 has no verdict/);
  assert.equal(completionGap("COMPLETED: H1 SUPPORTED; H2 RULED OUT\nH3 INCONCLUSIVE [E2]"), undefined);
});

test("lint rejects repeated table reads and timestamp-vs-date bounds", () => {
  assert.match(lintSql("WITH l AS (SELECT * FROM app_pg.trial_signups_daily), p AS (SELECT * FROM app_pg.trial_signups_daily) SELECT 1") ?? "", /more than once/);
  assert.match(lintSql("SELECT * FROM app_pg.accounts WHERE created_at BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'") ?? "", /to_date\(created_at\)/);
  assert.equal(lintSql("SELECT sum(CASE WHEN signup_date >= DATE '2026-10-12' THEN signups END) FROM app_pg.trial_signups_daily"), undefined);
  assert.equal(lintSql("SELECT count(*) FROM app_pg.accounts a JOIN ads_pg.ad_spend_daily s ON s.spend_date = to_date(a.created_at)"), undefined);
});

test("queries without attributes still get a hypothesis and purpose", () => {
  assert.deepEqual(labelQuery(' hypothesis="H2" purpose="brand clicks"', "", "SELECT 1"), { hypothesis: "H2", purpose: "brand clicks" });
  assert.deepEqual(labelQuery("", "", "-- H3: holiday check\nSELECT * FROM whybot.ca_holidays"), { hypothesis: "H3", purpose: "holiday check" });
  assert.deepEqual(labelQuery("", "Next I test H1 then H4.", "SELECT * FROM app_pg.accounts a JOIN ads_pg.campaigns c ON 1=1"), {
    hypothesis: "H4",
    purpose: "read app_pg.accounts, ads_pg.campaigns",
  });
});

test("SQL guard refuses writes and multiple statements", () => {
  assert.equal(guardSql("select 1;"), "select 1");
  assert.doesNotThrow(() => guardSql("SELECT to_date(created_at) FROM app_pg.accounts"));
  assert.throws(() => guardSql("DROP TABLE x"), /read-only/);
  assert.throws(() => guardSql("SELECT 1; DELETE FROM x"), /one statement/);
  assert.throws(() => guardSql("WITH a AS (SELECT 1) INSERT INTO t SELECT * FROM a"), /write keyword/);
  assert.doesNotThrow(() => guardSql("SELECT 'drop' AS word"));
});

test("Zetaris response normalisation handles row arrays and row objects", () => {
  assert.deepEqual(normalise({ data: [[1, "a"]] }), { columns: ["col1", "col2"], rows: [[1, "a"]] });
  assert.deepEqual(normalise({ data: [{ n: 1, s: "a" }] }), { columns: ["n", "s"], rows: [[1, "a"]] });
  assert.deepEqual(normalise({ data: [[5]], columns: [{ name: "n" }] }), { columns: ["n"], rows: [[5]] });
  // Real Zetaris 2.4.3.1 shape: headers + string values.
  assert.deepEqual(normalise({ headers: ["signup_date", "signups", "ratio"], data: [["2026-07-20", "56", "0.123456"]], total: 1 }), {
    columns: ["signup_date", "signups", "ratio"],
    rows: [["2026-07-20", 56, 0.123456]],
  });
});

test("citation check flags unknown ids, failed queries and uncited numbers", async () => {
  const ledger = new EvidenceLedger(new FakeSql());
  await ledger.run("SELECT 1", "H0", "ok");
  await ledger.run("SELECT * FROM broken", "H1", "bad");
  const md = "## Answer\nSignups fell 18% [E1].\nTracking explains 9% [E2].\nAds explain 40 signups.\nSee [E9].";
  const c = checkCitations(md, ledger.items);
  assert.deepEqual(c.unknown, ["E9"]);
  assert.deepEqual(c.failedQueriesCited, ["E2"]);
  assert.equal(c.uncitedNumbers.length, 1);
  assert.match(markdownToHtml(md), /<a class="cite" href="#E1">E1<\/a>/);
});

test("HTML report escapes SQL and links evidence", async () => {
  const llm = new ScriptedLLM([`Done [E1]? no queries. [TASK_COMPLETE]`]);
  const ledger = new EvidenceLedger(new FakeSql());
  await ledger.run("SELECT '<script>' AS x", "H0", "xss");
  const inv = await investigate({ question: "q <b>", llm, ledger });
  const html = renderHtml(inv, "## Answer\nok [E1]", checkCitations("ok [E1]", ledger.items), { provider: "p", model: "m" });
  assert.ok(html.includes('id="E1"'));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("q &lt;b&gt;"));
});

test("a quoted [TASK_COMPLETE] or a planned verdict does not end the investigation", () => {
  assert.equal(stripInlineCompletion("Step 5: write the conclusion and end with [TASK_COMPLETE]; otherwise query more."), "Step 5: write the conclusion and end with the completion marker; otherwise query more.");
  assert.equal(stripInlineCompletion("Conclusion. [TASK_COMPLETE]\n"), "Conclusion. [TASK_COMPLETE]");
  const plan = "H1 ads: SUPPORTED [E2]; H3 pricing: RULED OUT [E4]; H4 holidays: RULED OUT [E5]\n2. Test H2 (tracking/product release): query events; verdict SUPPORTED with effect size or RULED OUT.";
  assert.match(completionGap(plan) ?? "", /H2 has no verdict/);
});

test("the first step must run a query before it can checkpoint", async () => {
  const llm = new ScriptedLLM([
    `From memory the drop is 18%.
${state("H0 quantified", "H1; H2; H3")}`,
    `<sql hypothesis="H0" purpose="weekly totals">SELECT 1</sql>`,
    state("H0 quantified [E1]", "H1; H2; H3"),
  ]);
  const guards: string[] = [];
  const ledger = new EvidenceLedger(new FakeSql());
  await makeInvestigatorGenerator(llm, ledger, { onGuard: (m) => guards.push(m) })("goal", [], "system");
  assert.match(guards[0], /no query run yet/);
  assert.equal(ledger.items.length, 1);
});
