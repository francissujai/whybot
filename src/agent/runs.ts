// Saved investigations on disk. Live runs are written to runs/ (gitignored).
// samples/ holds a few real runs committed with the repo, so a fresh clone
// without Zetaris or Nightshift can still open the Archive, a report and a
// replay. A run in runs/ always wins over a sample with the same id.

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../env.ts";

export const RUNS_DIR = path.join(ROOT, "runs");
export const SAMPLES_DIR = path.join(ROOT, "samples");

export interface RunInfo {
  runId: string;
  question: string;
  replay: boolean;
  /** True when the run comes from samples/ (a recorded example), not from this machine's runs/. */
  sample: boolean;
}

export interface RunDirs {
  runs: string;
  samples: string;
}
const DEFAULT_DIRS: RunDirs = { runs: RUNS_DIR, samples: SAMPLES_DIR };

const RUN_ID = /^[\dT-]{19}$/;
const RUN_FILES = new Set(["report.html", "report.md", "events.jsonl", "evidence.json", "run.json", "receipts.json", "question.txt"]);

function reportRuns(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => RUN_ID.test(d) && fs.existsSync(path.join(dir, d, "report.html")));
}

function describe(dir: string, runId: string, sample: boolean): RunInfo {
  const q = path.join(dir, runId, "question.txt");
  const md = path.join(dir, runId, "report.md");
  const question = fs.existsSync(q) ? fs.readFileSync(q, "utf-8").trim() : (fs.readFileSync(md, "utf-8").match(/^# (.+)$/m)?.[1] ?? runId);
  return { runId, question, replay: fs.existsSync(path.join(dir, runId, "events.jsonl")), sample };
}

/** Past runs that produced a report, newest first: this machine's runs plus any sample runs not shadowed by them. */
export function listRuns(dirs: RunDirs = DEFAULT_DIRS): RunInfo[] {
  const live = reportRuns(dirs.runs);
  const seen = new Set(live);
  const samples = reportRuns(dirs.samples).filter((id) => !seen.has(id));
  return [...live.map((id) => describe(dirs.runs, id, false)), ...samples.map((id) => describe(dirs.samples, id, true))].sort((a, b) =>
    a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0,
  );
}

/** Path of a saved run's artifact, from runs/ first and samples/ second; undefined if neither has it. */
export function resolveRunFile(runId: string, file: string, dirs: RunDirs = DEFAULT_DIRS): string | undefined {
  if (!RUN_ID.test(runId) || !RUN_FILES.has(file)) return undefined;
  for (const base of [dirs.runs, dirs.samples]) {
    const p = path.join(base, runId, file);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return undefined;
}
