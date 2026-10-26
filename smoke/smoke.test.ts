// Smoke tests against a running web UI (see SMOKE_TESTS.md).
//
//   npm run serve     (in one terminal)
//   npm run smoke     (in another)
//
// WHYBOT_URL picks the server (default http://127.0.0.1:4173).
// SMOKE_LIVE=1 also runs a full investigation (needs Zetaris and Nightshift; takes minutes).

import assert from "node:assert/strict";
import { before, test } from "node:test";

const BASE = (process.env.WHYBOT_URL ?? "http://127.0.0.1:4173").replace(/\/+$/, "");

async function post(path: string, body: unknown) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Reads a job's SSE stream until the server sends `event: end`. */
async function followJob(job: string): Promise<{ type: string; [k: string]: unknown }[]> {
  const text = await (await fetch(`${BASE}/api/jobs/${job}/events`)).text();
  return text.split("\n").filter((l) => l.startsWith("data: ") && l !== "data: {}").map((l) => JSON.parse(l.slice(6)));
}

before(async () => {
  try {
    await fetch(BASE + "/api/status", { signal: AbortSignal.timeout(3000) });
  } catch {
    throw new Error(`web UI not reachable at ${BASE}; start it with npm run serve`);
  }
});

test("page loads the app", async () => {
  const res = await fetch(BASE + "/");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>WhyBot/);
  // The built app mounts on #root; the fallback page (no web build) has the question box inline.
  assert.match(html, /id="root"|<textarea/);
});

test("the app URL returns the app", async () => {
  const res = await fetch(BASE + "/app");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<title>WhyBot/);
});

test("replay URLs return the app and bad ids do not", async () => {
  const ok = await fetch(BASE + "/replay/2026-10-26T03-30-00");
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /<title>WhyBot/);
  assert.equal((await fetch(BASE + "/replay/not-a-run")).status, 404);
});

test("asset paths cannot leave the build folder", async () => {
  assert.equal((await fetch(BASE + "/assets/..%2F..%2Fpackage.json")).status, 404);
  assert.equal((await fetch(BASE + "/assets/missing.js")).status, 404);
});

test("status API lists runs", async () => {
  const res = await fetch(BASE + "/api/status");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { running: unknown; runs: unknown[] };
  assert.ok(Array.isArray(body.runs));
});

test("questions outside 8-300 characters are refused", async () => {
  assert.equal((await post("/api/investigate", { question: "why?" })).status, 400);
  assert.equal((await post("/api/investigate", { question: "x".repeat(301) })).status, 400);
});

test("unknown job and run ids return 404", async () => {
  assert.equal((await fetch(BASE + "/api/jobs/job-0-0/events")).status, 404);
  assert.equal((await fetch(BASE + "/runs/2000-01-01T00-00-00/report.html")).status, 404);
});

test("an investigation streams steps and ends with a report", { skip: process.env.SMOKE_LIVE !== "1" && "set SMOKE_LIVE=1 (needs Zetaris and Nightshift)", timeout: 20 * 60_000 }, async () => {
  const { status, body } = await post("/api/investigate", { question: "Why did trial signups drop 18% last week?" });
  assert.equal(status, 202);
  const events = await followJob(String(body.job));
  assert.deepEqual(events.filter((e) => e.type === "error"), []);
  assert.ok(events.some((e) => e.type === "query"), "ran at least one query");
  const done = events.find((e) => e.type === "done");
  assert.ok(done?.reportPath, "wrote a report");
});
