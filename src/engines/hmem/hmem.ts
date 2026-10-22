// H-MEM engine for WhyBot. Implements the Meterless H-MEM spec
// (github.com/meterless/meterless, engines/hmem/AGENTS.md, Apache-2.0):
// tiered memory (short_term / working / long_term) that persists across
// sessions, with provenance on every record, hybrid ranking, exact feedback
// deltas, an append-only trust ledger, a preview-first sleep cycle with
// guardrails, conflict detection that supersedes but never deletes, and
// dreaming proposals that need human approval before they become memory.
//
// WhyBot stores what each investigation concluded (verdicts with their
// evidence) and recalls it at the start of the next one.

import fs from "node:fs";
import path from "node:path";
import { classifyDomain, cosine, embed, extractEntities, jaccard, tokenize } from "./text.ts";

export type MemoryType = "personal" | "factual" | "preference" | "general";
export type MemoryLayer = "short_term" | "working" | "long_term";
export type FeedbackKind = "helpful" | "not_helpful" | "wrong";

export interface Provenance {
  origin: "investigation" | "user_correction" | "manual" | "dream" | "sleep_synthesis" | "model_response";
  learnedAt: number;
  label: string;
  refs?: string[]; // e.g. run id and evidence ids
}

export interface MemoryRecord {
  id: string;
  content: string;
  type: MemoryType;
  layer: MemoryLayer;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  tags: string[];
  embedding: number[];
  confidence: number;
  source: string;
  provenance: Provenance;
  domain: string;
  namespace: string;
  entities: string[];
  relatedTo: string[];
  supersedes?: string;
  supersededBy?: string;
  derivedFrom?: string[];
}

export interface AddInput {
  content: string;
  source: string;
  type?: MemoryType;
  layer?: MemoryLayer;
  tags?: string[];
  confidence?: number;
  provenance?: Provenance;
  namespace?: string;
  relatedTo?: string[];
  supersedes?: string;
  derivedFrom?: string[];
}

export interface LedgerEntry {
  memoryId: string;
  action: string;
  actor: string;
  timestamp: number;
  previousState?: Partial<MemoryRecord>;
  newState?: Partial<MemoryRecord>;
  details?: Record<string, unknown>;
}

export interface ConflictRecord {
  id: string;
  memoryA: string;
  memoryB: string;
  reason: string;
  confidence: number;
  resolved: boolean;
  resolution?: "keep_a" | "keep_b";
}

export interface DreamProposal {
  id: string;
  type: "insight" | "invariant";
  content: string;
  derivedFrom: string[];
  status: "proposed" | "approved" | "rejected";
}

export const FEEDBACK_DELTAS: Record<FeedbackKind, number> = { helpful: 0.05, not_helpful: -0.03, wrong: -0.2 };
export const DEFAULTS = {
  topN: 5,
  threshold: 0.35,
  consolidationDays: 7,
  archiveMinDays: 30,
  archiveMaxAccess: 2,
  synthesisCosine: 0.82,
  dreamRelatedness: 0.35,
  conflictGate: 0.7,
  recencyDays: 14,
  hubThreshold: 3,
};
const DAY = 86_400_000;
const LAYER_WEIGHT: Record<MemoryLayer, number> = { long_term: 1, working: 0.8, short_term: 0.6 };
const OPPOSING: [RegExp, RegExp][] = [
  [/\balways\b/i, /\bnever\b/i],
  [/\benabled?\b/i, /\bdisabled?\b/i],
  [/\bsupported\b/i, /\bruled out\b/i],
  [/\bincreased?\b/i, /\bdecreased?\b/i],
  [/\breal\b/i, /\bmeasurement\b/i],
];
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const snap = (m: MemoryRecord): Partial<MemoryRecord> => {
  const { embedding: _e, ...rest } = m;
  return structuredClone(rest);
};

export class HMEM {
  private records = new Map<string, MemoryRecord>();
  private seq = 0;
  private ledgerEntries: LedgerEntry[] = [];
  private conflictList: ConflictRecord[] = [];
  private proposals = new Map<string, DreamProposal>();
  private backups = new Map<string, { records: MemoryRecord[]; seq: number }>();
  private clock: () => number;
  private actor: string;
  private dir?: string;

  constructor(opts: { clock?: () => number; persistDir?: string; actor?: string } = {}) {
    this.clock = opts.clock ?? Date.now;
    this.actor = opts.actor ?? "whybot";
    if (opts.persistDir) {
      this.dir = opts.persistDir;
      fs.mkdirSync(this.dir, { recursive: true });
      const state = path.join(this.dir, "state.json");
      if (fs.existsSync(state)) {
        const s = JSON.parse(fs.readFileSync(state, "utf-8")) as { seq: number; records: MemoryRecord[] };
        this.seq = s.seq;
        for (const r of s.records) this.records.set(r.id, r);
      }
    }
  }

  // ------------------------------------------------------------ store

  add(input: AddInput): MemoryRecord {
    if (!input.content?.trim()) throw new Error("H-MEM: content is required");
    if (!input.source?.trim()) throw new Error("H-MEM: source is required (provenance)");
    const now = this.clock();
    const tags = input.tags ?? [];
    const m: MemoryRecord = {
      id: `mem-${++this.seq}`,
      content: input.content.trim(),
      type: input.type ?? "factual",
      layer: input.layer ?? "short_term",
      timestamp: now,
      lastAccessed: now,
      accessCount: 0,
      tags,
      embedding: embed(input.content),
      confidence: clamp01(input.confidence ?? 0.7),
      source: input.source,
      provenance: input.provenance ?? { origin: "manual", learnedAt: now, label: input.source },
      domain: classifyDomain(input.content, tags),
      namespace: input.namespace ?? "default",
      entities: extractEntities(input.content),
      relatedTo: (input.relatedTo ?? []).slice(0, 5),
      supersedes: input.supersedes,
      derivedFrom: input.derivedFrom,
    };
    this.records.set(m.id, m);
    if (m.supersedes) {
      const old = this.records.get(m.supersedes);
      if (old) old.supersededBy = m.id;
    }
    this.log(m.id, "create", { newState: snap(m) });
    this.persist();
    return m;
  }

  readonly store = {
    get: (id: string) => this.records.get(id),
    all: () => [...this.records.values()],
  };

  readonly ledger = {
    history: (id: string) => this.ledgerEntries.filter((e) => e.memoryId === id),
    all: () => [...this.ledgerEntries],
  };

  // ------------------------------------------------------------ retrieval

  /** Spec ranking: clamp01(.35 sem + .20 kw + .10 tag + .10 dom + .15 ent + .05 layer + .05 recency - .20 superseded) * confidence */
  score(m: MemoryRecord, q: { emb: number[]; tokens: string[]; entities: string[]; domain: string }): number {
    const raw =
      0.35 * clamp01(cosine(q.emb, m.embedding)) +
      0.2 * jaccard(q.tokens, tokenize(m.content)) +
      0.1 * jaccard(q.tokens, m.tags.map((t) => t.toLowerCase())) +
      0.1 * (m.domain === q.domain ? 1 : 0) +
      0.15 * jaccard(q.entities, m.entities) +
      0.05 * LAYER_WEIGHT[m.layer] +
      0.05 * Math.exp(-(this.clock() - m.lastAccessed) / DAY / DEFAULTS.recencyDays) -
      0.2 * (m.supersededBy ? 1 : 0);
    return clamp01(raw) * m.confidence;
  }

  query(text: string, opts: { topN?: number; threshold?: number; namespace?: string } = {}) {
    const q = { emb: embed(text), tokens: tokenize(text).slice(0, 8), entities: extractEntities(text), domain: classifyDomain(text) };
    const scored = this.store
      .all()
      .filter((m) => !opts.namespace || m.namespace === opts.namespace)
      .map((memory) => ({ memory, relevance: this.score(memory, q) }))
      .filter((s) => s.relevance >= (opts.threshold ?? DEFAULTS.threshold))
      .sort((a, b) => b.relevance - a.relevance || a.memory.id.localeCompare(b.memory.id))
      .slice(0, opts.topN ?? DEFAULTS.topN);
    for (const { memory } of scored) {
      memory.lastAccessed = this.clock();
      memory.accessCount++;
      this.log(memory.id, "read", { details: { query: text } });
    }
    if (scored.length) this.persist();
    return {
      memories: scored,
      context: this.reinjection(scored.map((s) => s.memory)),
      trace: {
        retrievalReason: `hybrid ranking for "${text}" (domain ${q.domain})`,
        scores: Object.fromEntries(scored.map((s) => [s.memory.id, Number(s.relevance.toFixed(4))])),
      },
    };
  }

  /** Domain-grouped block injected into the first chunk of an investigation. */
  reinjection(items: MemoryRecord[]): string {
    if (!items.length) return "";
    const lines = ["[MEMORY CONTEXT] What WhyBot learned in earlier investigations. Re-verify with one query before relying on it."];
    const byDomain = Map.groupBy(items, (m) => m.domain);
    for (const [domain, list] of [...byDomain].sort()) {
      lines.push(`## ${domain}`);
      for (const m of list) {
        const tier = m.layer === "long_term" ? "LT" : m.layer === "working" ? "WK" : "ST";
        lines.push(`- [${tier} conf ${m.confidence.toFixed(2)}] ${m.content} <${m.id}, learned ${new Date(m.provenance.learnedAt).toISOString().slice(0, 10)}>`);
      }
    }
    lines.push("[/MEMORY CONTEXT]");
    return lines.join("\n");
  }

  // ------------------------------------------------------------ feedback

  feedback(id: string, kind: FeedbackKind): MemoryRecord {
    const m = this.records.get(id);
    if (!m) throw new Error(`H-MEM: unknown memory ${id}`);
    const prev = snap(m);
    if (kind === "helpful") m.accessCount += 1;
    m.confidence = clamp01(Math.round((m.confidence + FEEDBACK_DELTAS[kind]) * 1e9) / 1e9);
    if (kind === "wrong" && !m.tags.includes("review")) m.tags.push("review");
    this.log(id, "feedback", { previousState: prev, newState: snap(m), details: { kind, delta: FEEDBACK_DELTAS[kind] } });
    this.persist();
    return m;
  }

  /** Explicit supersede (an application policy decision, e.g. newer evidence wins). Never deletes. */
  supersede(oldId: string, newId: string, reason: string): void {
    const old = this.records.get(oldId);
    const fresh = this.records.get(newId);
    if (!old || !fresh) throw new Error(`H-MEM: unknown memory ${old ? newId : oldId}`);
    const prev = snap(old);
    old.supersededBy = newId;
    fresh.supersedes ??= oldId;
    for (const c of this.conflictList) {
      if (!c.resolved && [c.memoryA, c.memoryB].includes(oldId) && [c.memoryA, c.memoryB].includes(newId)) {
        c.resolved = true;
        c.resolution = c.memoryA === newId ? "keep_a" : "keep_b";
      }
    }
    this.log(oldId, "conflict_resolved", { previousState: prev, newState: snap(old), details: { winner: newId, policy: reason } });
    this.persist();
  }

  /** Promote a memory one tier (short_term -> working -> long_term). */
  promote(id: string, to: MemoryLayer): void {
    const m = this.records.get(id);
    if (!m || m.layer === to) return;
    const prev = snap(m);
    m.layer = to;
    this.log(id, "promote", { previousState: prev, newState: snap(m) });
    this.persist();
  }

  // ------------------------------------------------------------ sleep cycle

  readonly sleep = {
    preview: () => {
      const now = this.clock();
      const all = this.store.all();
      const referenced = new Set(all.flatMap((m) => [...m.relatedTo, ...(m.derivedFrom ?? []), ...(m.supersedes ? [m.supersedes] : [])]));
      const toConsolidate = all.filter((m) => m.layer !== "long_term" && m.accessCount >= 2 && now - m.timestamp >= DEFAULTS.consolidationDays * DAY).map((m) => m.id);
      const toArchive = all
        .filter(
          (m) =>
            now - m.timestamp >= DEFAULTS.archiveMinDays * DAY &&
            m.accessCount <= DEFAULTS.archiveMaxAccess &&
            !referenced.has(m.id) &&
            !m.supersedes && // guardrail: current/superseding records
            !(m.derivedFrom ?? []).length && // guardrail: derived memories
            m.relatedTo.length < DEFAULTS.hubThreshold, // guardrail: relationship hubs
        )
        .map((m) => m.id);
      const toSynthesize: string[][] = [];
      const used = new Set<string>();
      for (const a of all) {
        if (used.has(a.id)) continue;
        const group = all.filter((b) => !used.has(b.id) && (b.id === a.id || cosine(a.embedding, b.embedding) >= DEFAULTS.synthesisCosine));
        if (group.length >= 2) {
          group.forEach((g) => used.add(g.id));
          toSynthesize.push(group.map((g) => g.id));
        }
      }
      return { toConsolidate, toArchive, toSynthesize };
    },
    execute: (plan?: { toConsolidate: string[]; toArchive: string[]; toSynthesize: string[][] }) => {
      plan ??= this.sleep.preview();
      const backupId = `backup-${this.clock()}-${this.backups.size + 1}`;
      this.backups.set(backupId, { records: structuredClone(this.store.all()), seq: this.seq });
      if (this.dir) fs.writeFileSync(path.join(this.dir, `${backupId}.json`), JSON.stringify(this.backups.get(backupId)));
      for (const id of plan.toConsolidate) {
        this.promote(id, "long_term");
        this.log(id, "sleep_consolidate");
      }
      for (const id of plan.toArchive) {
        if (!this.records.has(id)) continue;
        this.log(id, "sleep_archive", { previousState: snap(this.records.get(id)!) });
        this.records.delete(id);
      }
      let synthesized = 0;
      for (const group of plan.toSynthesize) {
        const members = group.map((id) => this.records.get(id)).filter((m): m is MemoryRecord => !!m);
        if (members.length < 2) continue;
        const merged = this.add({
          content: `Synthesis: ${members.map((m) => m.content).join(" | ")}`,
          source: "sleep:synthesis",
          layer: "long_term",
          tags: [...new Set(members.flatMap((m) => m.tags))],
          confidence: Math.max(...members.map((m) => m.confidence)),
          provenance: { origin: "sleep_synthesis", learnedAt: this.clock(), label: `synthesized from ${members.length} memories` },
          derivedFrom: members.map((m) => m.id),
        });
        this.log(merged.id, "sleep_synthesize", { details: { sources: group } });
        synthesized++;
      }
      this.persist();
      return { backupId, consolidated: plan.toConsolidate.length, archived: plan.toArchive.length, synthesized };
    },
    restore: (backupId: string) => {
      const b = this.backups.get(backupId);
      if (!b) throw new Error(`H-MEM: unknown backup ${backupId}`);
      this.records = new Map(structuredClone(b.records).map((r) => [r.id, r]));
      this.seq = b.seq;
      this.log("*", "restore", { details: { backupId } });
      this.persist();
    },
  };

  // ------------------------------------------------------------ conflicts

  readonly conflicts = {
    scan: (): ConflictRecord[] => {
      const all = this.store.all();
      const found: ConflictRecord[] = [];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const c = this.conflictBetween(all[i], all[j]);
          if (c) {
            found.push(c);
            this.conflictList.push(c);
            this.log(c.memoryA, "conflict_detected", { details: { with: c.memoryB, reason: c.reason, confidence: c.confidence } });
          }
        }
      }
      return found;
    },
    autoResolve: (c: ConflictRecord): "resolved" | "queued" => {
      const a = this.records.get(c.memoryA)!;
      const b = this.records.get(c.memoryB)!;
      const strength = (m: MemoryRecord) =>
        0.3 * (m.lastAccessed / Math.max(1, this.clock())) +
        0.2 * Math.min(1, m.accessCount / 10) +
        0.25 * m.confidence +
        0.1 * Math.min(1, m.content.length / 200) +
        0.15 * (m.provenance.origin === "user_correction" ? 1 : 0.5);
      const sa = strength(a);
      const sb = strength(b);
      const decision = clamp01(c.confidence * 0.6 + (Math.abs(sa - sb) / Math.max(sa, sb)) * 0.8);
      if (decision < DEFAULTS.conflictGate) return "queued";
      const [winner, loser] = sa >= sb ? [a, b] : [b, a];
      const prev = snap(loser);
      loser.supersededBy = winner.id; // kept and penalised, never deleted
      c.resolved = true;
      c.resolution = winner.id === c.memoryA ? "keep_a" : "keep_b";
      this.log(loser.id, "conflict_resolved", { previousState: prev, newState: snap(loser), details: { conflictId: c.id, winner: winner.id, decision } });
      this.persist();
      return "resolved";
    },
    queue: () => this.conflictList.filter((c) => !c.resolved),
  };

  private conflictBetween(a: MemoryRecord, b: MemoryRecord): ConflictRecord | undefined {
    if (a.supersedes === b.id || b.supersedes === a.id || a.supersededBy === b.id || b.supersededBy === a.id) return undefined;
    const sim = cosine(a.embedding, b.embedding);
    let reason = "";
    let confidence = 0;
    for (const [p, q] of OPPOSING) {
      if (sim > 0.5 && ((p.test(a.content) && q.test(b.content)) || (q.test(a.content) && p.test(b.content)))) {
        reason = "opposing claims on similar content";
        confidence = 0.5 + 0.3 * sim;
      }
    }
    if (!reason && sim > 0.8) {
      const na = a.content.match(/\d+(\.\d+)?/g) ?? [];
      const nb = b.content.match(/\d+(\.\d+)?/g) ?? [];
      if (na.length && nb.length && na.join() !== nb.join()) {
        reason = "similar content with different numbers";
        confidence = 0.55 + 0.25 * sim;
      }
    }
    if (!reason) return undefined;
    if (a.entities.some((e) => b.entities.includes(e))) confidence += 0.1;
    if (a.domain === b.domain) confidence += 0.05;
    if (a.relatedTo.includes(b.id)) confidence -= 0.1;
    return { id: `conflict-${this.conflictList.length + 1}`, memoryA: a.id, memoryB: b.id, reason, confidence: clamp01(confidence), resolved: false };
  }

  // ------------------------------------------------------------ dreaming

  readonly dreaming = {
    dream: (): DreamProposal[] => {
      const out: DreamProposal[] = [];
      const propose = (type: DreamProposal["type"], content: string, derivedFrom: string[]) => {
        const p: DreamProposal = { id: `dream-${this.proposals.size + 1}`, type, content, derivedFrom, status: "proposed" };
        this.proposals.set(p.id, p);
        out.push(p);
        this.log(p.id, "dream_proposed", { details: { type, derivedFrom } });
      };
      const all = this.store.all().filter((m) => !m.supersededBy);
      const used = new Set<string>();
      const related = (a: MemoryRecord, b: MemoryRecord) =>
        0.5 * Math.max(0, cosine(a.embedding, b.embedding)) + 0.2 * jaccard(a.tags, b.tags) + 0.1 * (a.domain === b.domain ? 1 : 0) + 0.2 * jaccard(a.entities, b.entities);
      for (const seed of all) {
        if (used.has(seed.id)) continue;
        const group = all.filter((o) => o.id === seed.id || (!used.has(o.id) && related(seed, o) >= DEFAULTS.dreamRelatedness));
        if (group.length >= 2) {
          group.forEach((g) => used.add(g.id));
          propose("insight", `Pattern across ${group.length} findings (${[...new Set(group.map((g) => g.domain))].join("/")}): ${group.map((g) => g.content).join(" + ")}`, group.map((g) => g.id));
        }
      }
      for (const [domain, list] of Map.groupBy(all.filter((m) => m.type === "preference" || m.type === "personal"), (m) => m.domain)) {
        if (list.length >= 2) propose("invariant", `Stable preference in ${domain}: ${list.map((m) => m.content).join("; ")}`, list.map((m) => m.id));
      }
      return out;
    },
    pending: () => [...this.proposals.values()].filter((p) => p.status === "proposed"),
    approve: (id: string): MemoryRecord | undefined => {
      const p = this.proposals.get(id);
      if (!p || p.status !== "proposed") throw new Error(`H-MEM: no pending proposal ${id}`);
      p.status = "approved";
      this.log(id, "dream_approved", { details: { type: p.type } });
      return this.add({
        content: p.content,
        source: "dreaming",
        type: p.type === "insight" ? "factual" : "preference",
        layer: "long_term",
        tags: [`dream:${p.type}`],
        confidence: 0.75,
        provenance: { origin: "dream", learnedAt: this.clock(), label: `approved ${p.type} proposal` },
        derivedFrom: p.derivedFrom,
      });
    },
    reject: (id: string) => {
      const p = this.proposals.get(id);
      if (!p || p.status !== "proposed") throw new Error(`H-MEM: no pending proposal ${id}`);
      p.status = "rejected";
      this.log(id, "dream_rejected");
    },
  };

  // ------------------------------------------------------------ persistence

  private log(memoryId: string, action: string, extra: Partial<LedgerEntry> = {}): void {
    const e: LedgerEntry = { memoryId, action, actor: this.actor, timestamp: this.clock(), ...extra };
    this.ledgerEntries.push(e);
    if (this.dir) fs.appendFileSync(path.join(this.dir, "ledger.jsonl"), JSON.stringify(e) + "\n");
  }

  private persist(): void {
    if (!this.dir) return;
    fs.writeFileSync(path.join(this.dir, "state.json"), JSON.stringify({ seq: this.seq, records: this.store.all() }));
  }
}
