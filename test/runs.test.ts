// Sample mode: runs/ is empty on a fresh clone, so the Archive, reports and
// replays fall back to the recorded runs committed under samples/.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listRuns, resolveRunFile, SAMPLES_DIR } from "../src/agent/runs.ts";

function tmpDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "whybot-runs-"));
  const dirs = { runs: path.join(root, "runs"), samples: path.join(root, "samples") };
  const write = (base: string, id: string, files: Record<string, string>) => {
    fs.mkdirSync(path.join(base, id), { recursive: true });
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(base, id, name), body);
  };
  return { root, dirs, write };
}

test("with no runs/ directory, sample runs are listed and labelled as samples", () => {
  const { root, dirs, write } = tmpDirs();
  write(dirs.samples, "2026-10-24T02-21-21", { "report.html": "<p>s</p>", "question.txt": "Why did trial signups drop 18% last week?\n", "events.jsonl": "{}\n" });
  write(dirs.samples, "2026-10-23T00-40-09", { "report.html": "<p>s</p>", "report.md": "# Why did mobile trial signups fall?\n" });
  const runs = listRuns(dirs);
  assert.deepEqual(runs, [
    { runId: "2026-10-24T02-21-21", question: "Why did trial signups drop 18% last week?", replay: true, sample: true },
    { runId: "2026-10-23T00-40-09", question: "Why did mobile trial signups fall?", replay: false, sample: true },
  ]);
  assert.equal(resolveRunFile("2026-10-24T02-21-21", "events.jsonl", dirs), path.join(dirs.samples, "2026-10-24T02-21-21", "events.jsonl"));
  assert.equal(resolveRunFile("2026-10-23T00-40-09", "events.jsonl", dirs), undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a local run shadows a sample with the same id and both are merged newest first", () => {
  const { root, dirs, write } = tmpDirs();
  write(dirs.samples, "2026-10-24T02-21-21", { "report.html": "sample", "question.txt": "sample q" });
  write(dirs.runs, "2026-10-24T02-21-21", { "report.html": "local", "question.txt": "local q" });
  write(dirs.runs, "2026-10-25T09-00-00", { "report.html": "local", "question.txt": "newer" });
  write(dirs.runs, "2026-10-26T09-00-00", { "question.txt": "no report yet" });
  const runs = listRuns(dirs);
  assert.deepEqual(runs.map((r) => [r.runId, r.sample, r.question]), [
    ["2026-10-25T09-00-00", false, "newer"],
    ["2026-10-24T02-21-21", false, "local q"],
  ]);
  assert.equal(fs.readFileSync(resolveRunFile("2026-10-24T02-21-21", "report.html", dirs)!, "utf-8"), "local");
  fs.rmSync(root, { recursive: true, force: true });
});

test("resolveRunFile refuses ids and file names outside the run layout", () => {
  const { root, dirs, write } = tmpDirs();
  write(dirs.samples, "2026-10-24T02-21-21", { "report.html": "x" });
  assert.equal(resolveRunFile("../../etc", "report.html", dirs), undefined);
  assert.equal(resolveRunFile("2026-10-24T02-21-21", "../.env", dirs), undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the committed samples/ has at least three complete runs and one replay", () => {
  const ids = fs.readdirSync(SAMPLES_DIR).filter((d) => /^[\dT-]{19}$/.test(d));
  assert.ok(ids.length >= 3, `expected >= 3 sample runs, found ${ids.length}`);
  for (const id of ids) for (const f of ["report.html", "report.md", "evidence.json", "run.json", "question.txt"]) assert.ok(fs.existsSync(path.join(SAMPLES_DIR, id, f)), `${id}/${f}`);
  assert.ok(ids.some((id) => fs.existsSync(path.join(SAMPLES_DIR, id, "events.jsonl"))), "at least one sample can be replayed");
  for (const id of ids) {
    const ev = path.join(SAMPLES_DIR, id, "events.jsonl");
    if (fs.existsSync(ev)) for (const line of fs.readFileSync(ev, "utf-8").split("\n").filter(Boolean)) JSON.parse(line);
  }
});
