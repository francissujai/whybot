// H-MEM in the WhyBot loop: findings are stored with provenance, survive a
// restart, are recalled for a related question, and reach chunk 1 only.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { EvidenceLedger } from "../src/agent/evidence.ts";
import { investigate } from "../src/agent/investigator.ts";
import { findingsFromState, learn, openMemory, recall, resolveConflicts } from "../src/agent/memory.ts";
import type { ChatMessage, ChatProvider, ChatResult } from "../src/llm/meterless.ts";

const STATE = `COMPLETED: H1 mobile tracking break after release 4.12.0: SUPPORTED, mobile trial_signup events fell 36% while signup_form_submit stayed flat [E3, E4]; H2 Brand Search budget cut 1200 to 500: SUPPORTED, brand clicks -55% [E5]; H3 Thanksgiving holiday: RULED OUT, one-day dip only [E6]
REMAINING: none
DECISIONS: backend accounts are the source of truth
CONTEXT: tracked -18.0% [E1]`;

class Scripted implements ChatProvider {
  readonly name = "scripted";
  readonly model = "scripted";
  prompts: ChatMessage[][] = [];
  constructor(private replies: string[]) {}
  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    this.prompts.push(messages);
    const text = this.replies.shift();
    if (text === undefined) throw new Error("exhausted");
    return { text, model: "scripted" };
  }
}
const noSql = { run: async () => ({ columns: [], rows: [], ms: 0 }) };

test("findings are parsed per hypothesis with their evidence ids and verdicts", () => {
  const f = findingsFromState(STATE);
  assert.equal(f.length, 3);
  assert.deepEqual(f[0].evidence, ["E3", "E4"]);
  assert.equal(f[0].verdict, "supported");
  assert.equal(f[2].verdict, "ruled_out");
  assert.doesNotMatch(f[0].text, /\[E3/);
});

test("learned findings persist, are recalled for a related question, and enter chunk 1 only", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whybot-mem-"));
  const first = await investigate({ question: "Why did trial signups drop 18% last week?", llm: new Scripted([`done\n[STATE_CHECKPOINT]\n${STATE}`, "Conclusion. [TASK_COMPLETE]"]), ledger: new EvidenceLedger(noSql) });
  first.run.finalState = STATE;
  const written = learn(openMemory(dir), first, "run-1", "Week 2026-10-12..2026-10-18");
  assert.equal(written.length, 4);
  assert.deepEqual(written[0].provenance.refs, ["run-1#E3", "run-1#E4"]);

  const reopened = openMemory(dir); // a new session
  assert.equal(reopened.store.all().length, 4);
  const { context, recalled } = recall(reopened, "Why did mobile trial signups fall after the release?");
  assert.ok(recalled.length > 0);
  assert.equal(recalled[0].id, written[0].id, "the mobile tracking finding ranks first");
  assert.match(context, /\[MEMORY CONTEXT\][\s\S]*4\.12\.0/);

  const llm = new Scripted([`checked\n[STATE_CHECKPOINT]\nCOMPLETED: H1 re-verified [E1]\nREMAINING: none\nDECISIONS: none\nCONTEXT: none`, "Same cause. [TASK_COMPLETE]"]);
  await investigate({ question: "Why did mobile trial signups fall?", llm, ledger: new EvidenceLedger(noSql), memoryContext: context });
  assert.match(llm.prompts[0][1].content, /\[MEMORY CONTEXT\]/);
  assert.doesNotMatch(llm.prompts[1][1].content, /\[MEMORY CONTEXT\]/);
});

test("a contradicting new finding supersedes the old one without deleting it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "whybot-mem-"));
  const mem = openMemory(dir);
  const old = mem.add({ content: "Thanksgiving holiday explains the signup drop: SUPPORTED", source: "investigation:old", confidence: 0.4 });
  const fresh = mem.add({ content: "Thanksgiving holiday explains the signup drop: RULED OUT", source: "investigation:new", confidence: 0.9 });
  resolveConflicts(mem, new Set([fresh.id]));
  assert.equal(mem.store.get(old.id)?.supersededBy, fresh.id);
  assert.ok(mem.store.get(old.id), "kept for audit");
  assert.ok(mem.ledger.history(old.id).some((e) => e.action === "conflict_resolved"), "decision is in the ledger");
  const top = mem.query("Thanksgiving holiday signup drop", { threshold: 0 }).memories[0];
  assert.equal(top.memory.id, fresh.id, "the superseded belief ranks lower");
});
