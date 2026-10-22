// Zetaris SQL tool. Sends one Lightning SQL statement to the local Zetaris
// REST API and returns rows. WhyBot is read-only: anything other than
// SELECT / WITH / SHOW / DESCRIBE is refused before it leaves the process.

import { randomUUID } from "node:crypto";
import { env } from "../env.ts";

export interface SqlResult {
  columns: string[];
  rows: unknown[][];
  ms: number;
}

export interface SqlRunner {
  run(sql: string, limit?: number): Promise<SqlResult>;
}

const READ_ONLY = /^\s*(select|with|show|describe|desc)\b/i;
const WRITE_WORDS = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|merge|register|cache|uncache|refresh|compile)\b/i;

/** Normalises a statement and throws when it is not a single read-only query. */
export function guardSql(sql: string): string {
  const s = sql.trim().replace(/;\s*$/, "");
  if (!s) throw new Error("empty SQL");
  if (s.includes(";")) throw new Error("one statement per call");
  if (!READ_ONLY.test(s)) throw new Error("read-only: only SELECT, WITH, SHOW and DESCRIBE are allowed");
  const stripped = s.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
  if (/^\s*(select|with)\b/i.test(stripped) && WRITE_WORDS.test(stripped.replace(/\bcreated_at\b|\bupdated_at\b/gi, ""))) {
    throw new Error("read-only: statement contains a write keyword");
  }
  return s;
}

export class ZetarisClient implements SqlRunner {
  private url = env("ZETARIS_REST_URL", "http://localhost:8888/api/v1.0").replace(/\/+$/, "");
  private key = env("ZETARIS_API_KEY");
  private org = env("ZETARIS_ORG_ID", "1");

  constructor() {
    if (this.key.startsWith("your-")) throw new Error("ZETARIS_API_KEY is a placeholder. Create a key in the Zetaris UI and put it in .env.");
  }

  async run(sql: string, limit = 200): Promise<SqlResult> {
    const statement = guardSql(sql);
    const t0 = Date.now();
    const res = await fetch(`${this.url}/sql-editor/sqls/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "X-Org-ID": this.org,
        "X-Request-ID": randomUUID(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ queryId: randomUUID(), sql: statement, source: "SqlEditor", limit }),
      signal: AbortSignal.timeout(300_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Zetaris HTTP ${res.status}: ${text.slice(0, 400)}`);
    const body = JSON.parse(text || "null") as Record<string, unknown> | null;
    return { ...normalise(body), ms: Date.now() - t0 };
  }
}

/**
 * Zetaris 2.4.3.1 answers {headers: string[], data: string[][], total, timeUsed},
 * with every value as a string. Numeric strings become numbers here.
 */
export function normalise(body: Record<string, unknown> | null): { columns: string[]; rows: unknown[][] } {
  const { columns, rows } = shape(body);
  return { columns, rows: rows.map((r) => r.map((v) => (typeof v === "string" && /^-?\d+(\.\d+)?(E-?\d+)?$/i.test(v) ? Number(v) : v))) };
}

function shape(body: Record<string, unknown> | null): { columns: string[]; rows: unknown[][] } {
  const data = (body?.data ?? []) as unknown[];
  const meta = (body?.headers ?? body?.columns ?? body?.schema ?? body?.columnNames) as unknown;
  let columns: string[] = Array.isArray(meta)
    ? meta.map((c) => (typeof c === "string" ? c : String((c as Record<string, unknown>)?.name ?? (c as Record<string, unknown>)?.columnName ?? "")))
    : [];
  let rows: unknown[][];
  if (data.length && !Array.isArray(data[0]) && typeof data[0] === "object") {
    columns = columns.length ? columns : Object.keys(data[0] as object);
    rows = data.map((r) => columns.map((c) => (r as Record<string, unknown>)[c]));
  } else {
    rows = data as unknown[][];
  }
  if (!columns.length && rows.length) columns = rows[0].map((_, i) => `col${i + 1}`);
  return { columns, rows };
}
