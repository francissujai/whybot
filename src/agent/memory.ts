// WhyBot's long-term memory, on the H-MEM engine. Before an investigation it
// recalls relevant past findings into the first Markovian chunk; after one it
// stores each verdict with provenance (run id + evidence ids), then lets
// conflict detection supersede older beliefs the new evidence contradicts.

import path from "node:path";
import { ROOT } from "../env.ts";
import { HMEM, type MemoryRecord } from "../engines/hmem/index.ts";
import type { Investigation } from "./investigator.ts";

export const MEMORY_DIR = path.join(ROOT, ".whybot", "memory");

export function openMemory(dir = MEMORY_DIR): HMEM {
  return new HMEM({ persistDir: dir, actor: "whybot" });
}

export function recall(mem: HMEM, question: string): { context: string; recalled: MemoryRecord[] } {
  const r = mem.query(question, { topN: 6, threshold: RECALL_THRESHOLD });
  return { context: r.context, recalled: r.memories.map((m) => m.memory) };
}

/** Splits the final COMPLETED line into one finding per hypothesis. */
export function findingsFromState(state: string): { text: string; evidence: string[]; verdict: string }[] {
  const completed = state.match(/COMPLETED:\s*([\s\S]*?)(?:\n(?:REMAINING|DECISIONS|CONTEXT):|$)/i)?.[1] ?? "";
  return completed
    .split(/;\s*(?=H\d)|\n+/)
    .map((s) => s.trim().replace(/^[-*]\s*/, ""))
    .filter((s) => /^H\d/.test(s) && s.length > 12)
    .map((s) => ({
      text: s.replace(/\s*\[(E\d+(?:,\s*E\d+)*)\]/g, "").trim(),
      evidence: [...s.matchAll(/E\d+/g)].map((m) => m[0]),
      verdict: /ruled out/i.test(s) ? "ruled_out" : /supported/i.test(s) ? "supported" : /inconclusive/i.test(s) ? "inconclusive" : "noted",
    }));
}

export function learn(mem: HMEM, inv: Investigation, runId: string, window: string): MemoryRecord[] {
  const written: MemoryRecord[] = [];
  for (const f of findingsFromState(inv.run.finalState)) {
    written.push(
      mem.add({
        content: `${window}: ${f.text.replace(/^H\d+\s*/, "")}`,
        source: `investigation:${runId}`,
        type: "factual",
        layer: f.verdict === "supported" ? "working" : "short_term",
        tags: [`verdict:${f.verdict}`, "finding"],
        confidence: f.verdict === "inconclusive" ? 0.5 : 0.8,
        provenance: { origin: "investigation", learnedAt: Date.now(), label: inv.question.slice(0, 120), refs: f.evidence.map((e) => `${runId}#${e}`) },
      }),
    );
  }
  const conclusion = inv.run.chunks.at(-1)?.content.replace(/^>>.*$/gm, "").trim();
  if (inv.run.status === "completed" && conclusion) {
    written.push(
      mem.add({
        content: `${window} conclusion for "${inv.question.slice(0, 100)}": ${conclusion.replace(/\s*\[E\d+(?:,\s*E\d+)*\]/g, "").slice(0, 600)}`,
        source: `investigation:${runId}`,
        type: "factual",
        layer: "working",
        tags: ["conclusion"],
        confidence: 0.8,
        provenance: { origin: "investigation", learnedAt: Date.now(), label: inv.question.slice(0, 120), refs: [runId] },
      }),
    );
  }
  resolveConflicts(mem, new Set(written.map((m) => m.id)));
  return written;
}

/**
 * Spec auto-resolve first (gate 0.70). If it queues a conflict between a
 * finding from this run and an older one, apply WhyBot's policy: the newer,
 * evidence-backed finding supersedes the older belief (kept for audit).
 */
export function resolveConflicts(mem: HMEM, fresh: Set<string>): void {
  for (const c of mem.conflicts.scan()) {
    if (mem.conflicts.autoResolve(c) === "resolved") continue;
    const aFresh = fresh.has(c.memoryA);
    const bFresh = fresh.has(c.memoryB);
    if (aFresh !== bFresh) mem.supersede(aFresh ? c.memoryB : c.memoryA, aFresh ? c.memoryA : c.memoryB, "newer evidence-backed finding wins");
  }
}

export const RECALL_THRESHOLD = 0.15; // the spec default 0.35 assumes a model embedder; WhyBot uses the hashed one
