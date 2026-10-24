// Evidence ledger. Every query WhyBot runs gets an id (E1, E2, ...) and is kept
// outside the model's context with its SQL and rows. The model sees a short
// preview and cites the id; the report links each citation back here.

import type { SqlRunner } from "../zetaris/client.ts";
import { lintSql } from "../zetaris/lint.ts";
import { PREVIEW_ROWS } from "./budget.ts";

export interface Evidence {
  id: string;
  hypothesis: string;
  purpose: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  ms: number;
  at: string;
  error?: string;
}


export class EvidenceLedger {
  readonly items: Evidence[] = [];

  constructor(private sql: SqlRunner) {}

  get(id: string): Evidence | undefined {
    return this.items.find((e) => e.id === id);
  }

  async run(sql: string, hypothesis: string, purpose: string): Promise<Evidence> {
    const id = `E${this.items.length + 1}`;
    const at = new Date().toISOString();
    let ev: Evidence;
    try {
      const problem = lintSql(sql);
      if (problem) throw new Error(problem);
      const r = await this.sql.run(sql, 200);
      ev = { id, hypothesis, purpose, sql: sql.trim(), columns: r.columns, rows: r.rows, rowCount: r.rows.length, ms: r.ms, at };
    } catch (err) {
      ev = { id, hypothesis, purpose, sql: sql.trim(), columns: [], rows: [], rowCount: 0, ms: 0, at, error: (err as Error).message };
    }
    this.items.push(ev);
    return ev;
  }

  /** The block the model sees after a query. */
  static preview(ev: Evidence): string {
    if (ev.error) return `<result id="${ev.id}" error="true">${ev.error.slice(0, 600)}\nFix the SQL and try again, or move on.</result>`;
    const lines = [ev.columns.join(","), ...ev.rows.slice(0, PREVIEW_ROWS).map((r) => r.map(fmt).join(","))];
    const more = ev.rowCount > PREVIEW_ROWS ? `\n... ${ev.rowCount - PREVIEW_ROWS} more rows not shown; aggregate further` : "";
    return `<result id="${ev.id}" rows="${ev.rowCount}">\n${lines.join("\n")}${more}\n</result>`;
  }
}

export function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  const s = String(v);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
