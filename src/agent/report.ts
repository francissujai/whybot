// Turns a finished investigation into a report where every claim links to the
// SQL and rows behind it, then checks the citations: unknown evidence ids are
// flagged, and so is any sentence that states a number without citing one.

import type { ChatProvider } from "../llm/meterless.ts";
import { runEfficiency } from "../engines/markovian/index.ts";
import { fmt, type Evidence } from "./evidence.ts";
import type { Investigation } from "./investigator.ts";
import type { MemoryRecord } from "../engines/hmem/index.ts";

export interface CitationCheck {
  cited: string[];
  unknown: string[];
  uncitedNumbers: string[];
  failedQueriesCited: string[];
}

export async function writeReport(inv: Investigation, llm: ChatProvider): Promise<string> {
  const evidenceIndex = inv.ledger.items
    .map((e) => {
      if (e.error) return `[${e.id}] ${e.hypothesis} ${e.purpose}: QUERY FAILED`;
      const head = [e.columns.join(","), ...e.rows.slice(0, 12).map((r) => r.map(fmt).join(","))].join("\n  ");
      return `[${e.id}] ${e.hypothesis} ${e.purpose} (${e.rowCount} rows)\n  ${head}`;
    })
    .join("\n");
  const prompt = `Question: ${inv.question}

Final investigation state:
${inv.run.finalState}

Investigation notes, step by step:
${inv.run.chunks.map((c) => `--- step ${c.id}\n${c.content}`).join("\n")}

Evidence (id, hypothesis, purpose, rows):
${evidenceIndex}

Write the report in Markdown with exactly these sections:
## Answer
Two or three sentences a marketing lead can act on. Lead with the cause, not the method.
## What explains the change
A table: | Cause | Real or measurement | Effect on the metric | Verdict | Evidence |. Include a row for anything unexplained.
## Hypotheses ruled out
One bullet per hypothesis, with the reason and evidence.
## What to do next
Two to four concrete actions with an owner (marketing, growth, analytics, engineering).
## Caveats
What the data cannot tell us.

Rules: cite evidence ids in square brackets like [E3] after every number. Use only numbers that appear in the evidence or the notes. Do not invent evidence ids. Keep the whole report under 450 words.`;
  const messages = [
    { role: "system" as const, content: "You are WhyBot's report writer. Precise, plain English, no hype. Every number is cited." },
    { role: "user" as const, content: prompt },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await llm.chat(messages, { maxTokens: 4000, temperature: 0.1 });
      if (r.text.trim()) return r.text.trim();
    } catch {
      await new Promise((res) => setTimeout(res, 15_000));
    }
  }
  return fallbackReport(inv);
}

/** Used when the model cannot write the report: the investigation's own notes, unedited. */
export function fallbackReport(inv: Investigation): string {
  return [
    "## Answer",
    "The report writer was unavailable, so these are the investigation's own notes.",
    "## Final state",
    ...inv.run.finalState.split("\n").map((l) => `- ${l}`),
    "## Steps",
    ...inv.run.chunks.map((c) => `### Step ${c.id}\n${c.content}`),
  ].join("\n");
}

export function checkCitations(markdown: string, evidence: Evidence[]): CitationCheck {
  const ids = new Set(evidence.map((e) => e.id));
  const failed = new Set(evidence.filter((e) => e.error).map((e) => e.id));
  const cited = [...new Set([...markdown.matchAll(/\[(E\d+)\]/g)].map((m) => m[1]))];
  const sentences = markdown
    .replace(/^#.*$/gm, "")
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const uncitedNumbers = sentences.filter((s) => /\d[\d,.]*\s*%|\b\d{2,}[\d,]*\b/.test(s.replace(/\[E\d+\]|20\d\d-\d\d-\d\d|v?\d+\.\d+\.\d+|\bH\d+\b/g, "")) && !/\[E\d+\]/.test(s) && !/^\|?\s*-{3}/.test(s));
  return {
    cited,
    unknown: cited.filter((c) => !ids.has(c)),
    uncitedNumbers,
    failedQueriesCited: cited.filter((c) => failed.has(c)),
  };
}

// ---------------------------------------------------------------- HTML

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[(E\d+)\]/g, '<a class="cite" href="#$1">$1</a>');
}

/** Small Markdown subset: headings, paragraphs, bullets, tables. */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|?\s*:?-{3,}/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      i--;
      const [head, ...body] = rows;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (/^#{1,4}\s/.test(line)) {
      const level = Math.min(4, line.match(/^#+/)![0].length + 1);
      out.push(`<h${level}>${inline(line.replace(/^#+\s*/, ""))}</h${level}>`);
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ""))}</li>`);
      i--;
      out.push(`<ul>${items.join("")}</ul>`);
    } else if (line.trim()) {
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  return out.join("\n");
}

export function renderHtml(
  inv: Investigation,
  reportMd: string,
  check: CitationCheck,
  meta: {
    provider: string;
    model: string;
    recalled?: MemoryRecord[];
    written?: MemoryRecord[];
    receipts?: { model: string; label: string; provider: string; kind: string; calls: number; tokensIn: number; tokensOut: number }[];
  },
): string {
  const receiptsSection = meta.receipts?.length
    ? `<h2>Model calls (Nightshift compute receipts)</h2><p class="muted">Which model actually answered each call, as reported by Meterless Runtime. Full receipts with ids are in receipts.json.</p><table><thead><tr><th>Served by</th><th>Provider</th><th>Where</th><th>Calls</th><th>Tokens in</th><th>Tokens out</th></tr></thead><tbody>${meta.receipts
        .map((r) => `<tr><td>${esc(r.label)}<br><code>${esc(r.model)}</code></td><td>${esc(r.provider)}</td><td>${esc(r.kind)}</td><td>${r.calls}</td><td>${r.tokensIn.toLocaleString()}</td><td>${r.tokensOut.toLocaleString()}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  const memRow = (m: MemoryRecord) =>
    `<tr><td><code>${esc(m.id)}</code></td><td>${esc(m.layer)}</td><td>${m.confidence.toFixed(2)}</td><td>${esc(m.content)}</td><td class="muted">${esc(m.provenance.refs?.join(", ") ?? m.source)}</td></tr>`;
  const memTable = (title: string, list: MemoryRecord[], empty: string) =>
    `<h3>${title}</h3>${list.length ? `<table><thead><tr><th>id</th><th>tier</th><th>conf</th><th>memory</th><th>provenance</th></tr></thead><tbody>${list.map(memRow).join("")}</tbody></table>` : `<p class="muted">${empty}</p>`}`;
  const memorySection =
    meta.recalled || meta.written
      ? `<h2>Memory (H-MEM engine)</h2><p class="muted">Findings from earlier investigations go into the first step. New verdicts are stored with the run and evidence they came from.</p>${memTable("Recalled before this investigation", meta.recalled ?? [], "Nothing relevant in memory yet.")}${memTable("Stored after this investigation", meta.written ?? [], "Nothing stored.")}`
      : "";
  const { run, ledger } = inv;
  const eff = runEfficiency(run.chunks, run.chunkConfig);
  // Prompt size per chunk (flat under Markovian) vs. what a single growing context would send.
  let carried = 0;
  const bars = run.chunks.map((c) => {
    const flat = c.promptTokens ?? 0;
    const naive = flat + carried;
    carried += c.tokens; // a naive conversation re-sends at least every earlier answer (lower bound)
    return { id: c.id, flat, naive };
  });
  const max = Math.max(1, ...bars.map((b) => b.naive));
  const chart = bars
    .map(
      (b) =>
        `<div class="bar"><span class="lbl">step ${b.id}</span><div class="track"><div class="naive" style="width:${(b.naive / max) * 100}%"></div><div class="flat" style="width:${(b.flat / max) * 100}%"></div></div><span class="num">${b.flat.toLocaleString()} / ${b.naive.toLocaleString()}</span></div>`,
    )
    .join("");
  const evidenceHtml = ledger.items
    .map((e) => {
      const table = e.error
        ? `<p class="err">Query failed: ${esc(e.error)}</p>`
        : `<table><thead><tr>${e.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${e.rows
            .slice(0, 60)
            .map((r) => `<tr>${r.map((v) => `<td>${esc(fmt(v))}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>${e.rowCount > 60 ? `<p class="muted">${e.rowCount - 60} more rows in evidence.json</p>` : ""}`;
      return `<details id="${e.id}" class="ev"${check.cited.includes(e.id) ? " open" : ""}><summary><b>${e.id}</b> · ${esc(e.hypothesis)} · ${esc(e.purpose)} <span class="muted">${e.rowCount} rows · ${e.ms} ms</span></summary><pre>${esc(e.sql)}</pre>${table}</details>`;
    })
    .join("\n");
  const warnings = [
    ...check.unknown.map((id) => `Cites ${id}, which does not exist.`),
    ...check.failedQueriesCited.map((id) => `Cites ${id}, a query that failed.`),
    ...check.uncitedNumbers.map((s) => `Number without a citation: “${s.slice(0, 140)}”`),
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhyBot · ${esc(inv.question)}</title>
<style>
:root{--ink:#16181d;--muted:#667085;--line:#e4e7ec;--accent:#0b6bcb;--bg:#fbfbfa;--flat:#0b6bcb;--naive:#d0d5dd;--warn:#b54708}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:940px;margin:0 auto;padding:40px 24px 80px}header h1{font-size:26px;margin:0 0 6px;letter-spacing:-.01em}
.muted{color:var(--muted);font-size:13px}h2{font-size:19px;margin:34px 0 10px}h3{font-size:16px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13.5px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{font-weight:600;background:#f2f4f7}
a.cite{display:inline-block;font-size:11.5px;font-weight:600;color:var(--accent);background:#eaf2fb;border-radius:4px;padding:0 5px;text-decoration:none}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:18px 22px;margin:18px 0}
.ev{background:#fff;border:1px solid var(--line);border-radius:8px;margin:8px 0;padding:8px 12px}.ev summary{cursor:pointer}.ev:target{outline:2px solid var(--accent)}
pre{background:#f2f4f7;border-radius:6px;padding:10px;overflow:auto;font-size:12.5px}
.warn{border-left:3px solid var(--warn);background:#fffaeb;padding:8px 12px;font-size:13.5px}.ok{border-left:3px solid #067647;background:#ecfdf3;padding:8px 12px;font-size:13.5px}
.bar{display:grid;grid-template-columns:60px 1fr 120px;gap:10px;align-items:center;font-size:12.5px;margin:4px 0}.track{position:relative;height:14px}
.track div{position:absolute;left:0;top:0;height:100%;border-radius:3px}.naive{background:var(--naive)}.flat{background:var(--flat)}.num{color:var(--muted);text-align:right}
.legend span{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 12px;vertical-align:middle}.err{color:var(--warn)}
</style></head><body><main>
<header><div class="muted">WhyBot investigation · ${esc(new Date(run.timestamp).toISOString().slice(0, 16).replace("T", " "))} UTC</div><h1>${esc(inv.question)}</h1>
<div class="muted">${ledger.items.length} queries through Zetaris · ${run.chunks.length} Markovian steps (${esc(run.status)}) · model ${esc(meta.model)} via ${esc(meta.provider)}</div></header>
<div class="card">${markdownToHtml(reportMd)}</div>
<h2>Citation check</h2>
${warnings.length ? warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join("") : `<div class="ok">Every number cites evidence, and all ${check.cited.length} cited queries exist and succeeded.</div>`}
<h2>Context per step (Markovian engine)</h2>
<p class="muted">Tokens sent to the model per step: <b style="color:var(--flat)">flat</b> carryover prompt vs. a <b>naive</b> single conversation that keeps every earlier step (lower bound: earlier answers only). Token numbers are <b>${esc(run.tokenLabel)}</b>. Run efficiency ${eff.efficiencyPercent.toFixed(1)}% (${eff.tokensSaved.toLocaleString()} tokens saved by the spec formula).</p>
<div class="legend muted"><span style="background:var(--flat)"></span>Markovian<span style="background:var(--naive)"></span>naive</div>
${chart}
${receiptsSection}
${memorySection}
<h2>Evidence</h2>
<p class="muted">Every query WhyBot ran, with the exact SQL and rows. Cited items are open.</p>
${evidenceHtml}
</main></body></html>`;
}
