// The hand-coded equivalent of the WhyBot USL queries (data/zetaris/usl_queries.sql):
// connect to both Postgres databases and the canada-holidays.ca API directly,
// and join the results in TypeScript. Then run the same three questions
// through the Zetaris USL and compare answers and wall-clock time.
//
//   npm run zetaris:compare
//
// Needs the demo Postgres (npm run data:up, published on 127.0.0.1:55432) and,
// for the USL half, Zetaris with usl_create.sql already applied.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { env, ROOT } from "../src/env.ts";
import { splitStatements } from "./zetaris-usl.ts";
import { ZetarisClient } from "../src/zetaris/client.ts";

// ------------------------------------------------------------- hand-coded: begin
type Row = Record<string, unknown>;
const WEEK_START = "2026-10-12";
const FROM = "2026-10-05";
const TO = "2026-10-18";
const iso = (d: unknown) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : String(d).slice(0, 10));
const n = (v: unknown) => Number(v ?? 0);

async function query(database: string, sql: string, params: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ host: "127.0.0.1", port: Number(env("WHYBOT_PG_PORT", "55432")), user: "whybot", password: env("WHYBOT_PG_PASSWORD", "whybot_local_dev"), database });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
}

async function holidays(year: number): Promise<Map<string, string>> {
  const res = await fetch(`https://canada-holidays.ca/api/v1/holidays?year=${year}`);
  if (!res.ok) throw new Error(`holidays API HTTP ${res.status}`);
  const body = (await res.json()) as { holidays: { date: string; nameEn: string }[] };
  const byDate = new Map<string, string[]>();
  for (const h of body.holidays) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h.nameEn]);
  return new Map([...byDate].map(([d, names]) => [d, names.sort().join(" / ")]));
}

export async function handCoded() {
  const [events, accountsByDevice, spend, accountsByChannel, tracked, hol] = await Promise.all([
    query("appdb", "SELECT event_date, device, event_count FROM tracking_events_daily WHERE event_name = 'trial_signup' AND event_date BETWEEN $1 AND $2", [FROM, TO]),
    query("appdb", "SELECT created_at::date AS d, device, count(*) AS n FROM accounts WHERE created_at::date BETWEEN $1 AND $2 GROUP BY 1, 2", [FROM, TO]),
    query("adsdb", "SELECT s.spend_date, sum(s.spend_usd) AS spend FROM ad_spend_daily s JOIN campaigns c USING (campaign_id) WHERE c.channel = 'paid_search' AND s.spend_date BETWEEN $1 AND $2 GROUP BY 1", [FROM, TO]),
    query("appdb", "SELECT created_at::date AS d, signup_channel AS channel, count(*) AS n FROM accounts WHERE created_at::date BETWEEN $1 AND $2 GROUP BY 1, 2", [FROM, TO]),
    query("appdb", "SELECT signup_date, channel, sum(signups) AS n FROM trial_signups_daily WHERE signup_date BETWEEN $1 AND $2 GROUP BY 1, 2", [FROM, TO]),
    holidays(2026),
  ]);
  const week = (d: unknown) => (iso(d) >= WEEK_START ? "last" : "prior");

  // U1: tracked vs created per device and week.
  const u1 = new Map<string, Record<string, number>>();
  const bump = (m: Map<string, Record<string, number>>, k: string, f: string, v: number) => {
    const r = m.get(k) ?? {};
    r[f] = (r[f] ?? 0) + v;
    m.set(k, r);
  };
  for (const e of events) bump(u1, String(e.device), `tracked_${week(e.event_date)}`, n(e.event_count));
  for (const a of accountsByDevice) bump(u1, String(a.device), `created_${week(a.d)}`, n(a.n));
  const U1 = [...u1].sort().map(([device, r]) => ({ device, tracked_prior: r.tracked_prior, tracked_last: r.tracked_last, created_prior: r.created_prior, created_last: r.created_last, coverage_last: Math.round((r.tracked_last / r.created_last) * 1000) / 1000 }));

  // U2: paid-search spend vs paid-search accounts per day, with holidays.
  const psAccounts = new Map<string, number>();
  for (const a of accountsByChannel) if (a.channel === "paid_search") psAccounts.set(iso(a.d), n(a.n));
  const U2 = spend
    .map((s) => ({ day: iso(s.spend_date), paid_search_spend: Math.round(n(s.spend) * 100) / 100, paid_search_accounts: psAccounts.get(iso(s.spend_date)) ?? 0, holiday: hol.get(iso(s.spend_date)) ?? null }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // U3: created and tracked change per channel.
  const u3 = new Map<string, Record<string, number>>();
  for (const a of accountsByChannel) bump(u3, String(a.channel), `created_${week(a.d)}`, n(a.n));
  for (const t of tracked) bump(u3, String(t.channel), `tracked_${week(t.signup_date)}`, n(t.n));
  const U3 = [...u3]
    .map(([channel, r]) => ({ channel, created_prior: r.created_prior ?? 0, created_last: r.created_last ?? 0, created_change: (r.created_last ?? 0) - (r.created_prior ?? 0), tracked_change: (r.tracked_last ?? 0) - (r.tracked_prior ?? 0) }))
    .sort((a, b) => a.created_change - b.created_change || a.channel.localeCompare(b.channel));
  return { U1, U2, U3 };
}
// ------------------------------------------------------------- hand-coded: end

async function viaUsl() {
  const z = new ZetarisClient();
  const stmts = splitStatements(fs.readFileSync(path.join(ROOT, "data/zetaris/usl_queries.sql"), "utf-8"));
  const out = [];
  for (const s of stmts) out.push(await z.run(s.sql));
  return out;
}

const loc = (text: string, comment: RegExp) => text.split(/\r?\n/).filter((l) => l.trim() && !comment.test(l.trim())).length;

async function main() {
  let t0 = Date.now();
  const hc = await handCoded();
  const hcMs = Date.now() - t0;
  t0 = Date.now();
  const usl = await viaUsl();
  const uslMs = Date.now() - t0;

  const self = fs.readFileSync(path.join(ROOT, "scripts/handcoded-compare.ts"), "utf-8");
  const core = self.slice(self.indexOf("hand-coded: begin"), self.indexOf("hand-coded: end"));
  const uslCreate = fs.readFileSync(path.join(ROOT, "data/zetaris/usl_create.sql"), "utf-8");
  const uslModel = uslCreate.slice(uslCreate.indexOf("COMPILE USL"), uslCreate.indexOf("-- Step 3"));
  const uslQueries = fs.readFileSync(path.join(ROOT, "data/zetaris/usl_queries.sql"), "utf-8");

  console.log("U1 hand-coded:", JSON.stringify(hc.U1));
  console.log("U1 USL:       ", JSON.stringify(usl[0].rows));
  console.log("U2 hand-coded:", JSON.stringify(hc.U2.map((r) => [r.day, r.paid_search_spend, r.paid_search_accounts, r.holiday])));
  console.log("U2 USL:       ", JSON.stringify(usl[1].rows.map((r) => [r[0], r[2], r[3], r[4]])));
  console.log("U3 hand-coded:", JSON.stringify(hc.U3.map((r) => [r.channel, r.created_prior, r.created_last, r.created_change, r.tracked_change])));
  console.log("U3 USL:       ", JSON.stringify(usl[2].rows));

  const same1 = JSON.stringify(hc.U1.map((r) => [r.device, r.tracked_prior, r.tracked_last, r.created_prior, r.created_last, r.coverage_last])) === JSON.stringify(usl[0].rows);
  const same2 = JSON.stringify(hc.U2.map((r) => [r.day, r.paid_search_spend, r.paid_search_accounts, r.holiday])) === JSON.stringify(usl[1].rows.map((r) => [r[0], r[2], r[3], r[4] === "NULL" ? null : r[4]]));
  const same3 = JSON.stringify([...hc.U3.map((r) => [r.channel, r.created_prior, r.created_last, r.created_change, r.tracked_change])].sort()) === JSON.stringify([...usl[2].rows].sort());
  console.log(`\nSame answers: U1 ${same1}, U2 ${same2}, U3 ${same3}`);
  console.log(`Wall clock (one warm run): hand-coded ${hcMs} ms, USL ${uslMs} ms`);
  console.log(`Lines of code (non-blank, non-comment): hand-coded core ${loc(core, /^\/\//)}; USL model DDL + activations ${loc(uslModel, /^--/)}, USL queries ${loc(uslQueries, /^--/)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, "scripts", "handcoded-compare.ts")) await main();
