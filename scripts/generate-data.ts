// Generates the WhyBot demo dataset as Postgres seed files in data/seed/.
//
//   npx tsx scripts/generate-data.ts
//
// Two databases, loaded by the whybot-pg container and federated by Zetaris:
//   adsdb  - ad platform export: campaigns, ad_spend_daily, ad_change_log
//   appdb  - product side: accounts (backend source of truth), trial_signups_daily
//            (what the analytics dashboard counts), tracking_events_daily,
//            sessions_daily, release_log, pricing_history
//
// Planted story (deterministic, seed 42). Dashboard: tracked trial signups for
// Mon 12 Oct - Sun 18 Oct 2026 are ~18% below the week before. The causes:
//   1. REAL: on 13 Oct the "Brand Search - North America" daily budget was cut
//      1200 -> 500, so brand clicks and brand signups fell.
//   2. NOT REAL: release v4.12.0 (13 Oct 15:40) shipped a new mobile signup
//      stepper. On mobile the `trial_signup` analytics event stops firing for
//      about a third of signups. Backend accounts are unaffected.
// Red herrings the agent should rule out with evidence:
//   - Thanksgiving (CA) / Columbus Day (US) on Mon 12 Oct: a one-day dip only.
//   - Pricing: no change since 1 Jun.
//   - Social creative swap on 14 Oct: no measurable effect.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "seed");

// ---------- deterministic randomness ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const noisy = (mean: number, cv = 0.08) => Math.max(0, Math.round(mean * (1 + cv * gauss())));
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

// ---------- calendar ----------
const START = Date.UTC(2026, 6, 20); // Mon 20 Jul 2026
const DAYS = 91; // through Sun 18 Oct 2026
const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const days = Array.from({ length: DAYS }, (_, i) => START + i * DAY_MS);

const HOLIDAYS: Record<string, number> = {
  "2026-08-03": 0.9, // Civic Holiday (CA, most provinces)
  "2026-09-07": 0.8, // Labour Day / Labor Day
  "2026-10-12": 0.84, // Thanksgiving (CA) / Columbus Day (US)
};
const BUDGET_CUT = "2026-10-13";
const RELEASE_DAY = "2026-10-13"; // deployed 15:40, so about a third of the day is affected
const MOBILE_CAPTURE_AFTER = 0.64; // share of mobile signups the tracker still records

// ---------- dimensions ----------
type Channel = "paid_search_brand" | "paid_search_generic" | "paid_social" | "display" | "organic" | "direct" | "referral" | "email";
const CHANNEL_SHARE: Record<Channel, number> = {
  paid_search_brand: 0.18,
  paid_search_generic: 0.11,
  paid_social: 0.14,
  display: 0.02,
  organic: 0.29,
  direct: 0.13,
  referral: 0.05,
  email: 0.08,
};
// The analytics tool reports one "paid_search" channel; the ad platform knows the campaign.
const REPORTED_CHANNEL: Record<Channel, string> = {
  paid_search_brand: "paid_search",
  paid_search_generic: "paid_search",
  paid_social: "paid_social",
  display: "display",
  organic: "organic",
  direct: "direct",
  referral: "referral",
  email: "email",
};
const LANDING: Record<Channel, string[]> = {
  paid_search_brand: ["/", "/pricing"],
  paid_search_generic: ["/lp/analytics-tools", "/pricing"],
  paid_social: ["/lp/why-numbers-move", "/"],
  display: ["/"],
  organic: ["/", "/blog", "/pricing", "/docs"],
  direct: ["/", "/pricing", "/start"],
  referral: ["/", "/start"],
  email: ["/start", "/pricing"],
};
const CONV_RATE: Record<Channel, number> = {
  paid_search_brand: 0.061,
  paid_search_generic: 0.024,
  paid_social: 0.017,
  display: 0.006,
  organic: 0.021,
  direct: 0.044,
  referral: 0.031,
  email: 0.052,
};
const MOBILE_SHARE = 0.4;
const COUNTRIES = ["CA", "CA", "US", "US", "US", "GB", "AU"];

// ---------- adsdb ----------
const campaigns = [
  { id: 101, name: "Brand Search - North America", channel: "paid_search", platform: "google_ads", objective: "conversions", budget: 1200, cpc: 1.35, src: "paid_search_brand" as Channel },
  { id: 102, name: "Generic Search - Analytics Tools", channel: "paid_search", platform: "google_ads", objective: "conversions", budget: 900, cpc: 3.4, src: "paid_search_generic" as Channel },
  { id: 201, name: "Social - Retargeting", channel: "paid_social", platform: "meta_ads", objective: "conversions", budget: 450, cpc: 0.95, src: "paid_social" as Channel },
  { id: 202, name: "Social - Lookalike Q4", channel: "paid_social", platform: "meta_ads", objective: "conversions", budget: 400, cpc: 1.1, src: "paid_social" as Channel },
  { id: 301, name: "Display - Awareness", channel: "display", platform: "google_ads", objective: "reach", budget: 250, cpc: 0.55, src: "display" as Channel },
];
const adChanges = [
  ["2026-08-05 10:02:00", 102, "bid_strategy", "manual_cpc", "target_cpa", "maria.chen"],
  ["2026-09-15 08:30:00", 202, "status", "draft", "active", "maria.chen"],
  ["2026-09-28 14:11:00", 301, "daily_budget", "300", "250", "ops-bot"],
  ["2026-10-13 09:12:00", 101, "daily_budget", "1200", "500", "ops-bot (Q4 budget rebalance)"],
  ["2026-10-14 11:45:00", 201, "creative", "carousel_v3", "video_v1", "jordan.lee"],
];

// ---------- appdb ----------
const releases = [
  ["2026-07-28 16:05:00", "4.8.0", "dashboard", "Saved views for charts", "dev-team"],
  ["2026-08-19 15:20:00", "4.9.0", "billing", "Annual plan toggle on checkout", "dev-team"],
  ["2026-09-09 14:00:00", "4.10.0", "signup-web", "Password strength meter on desktop signup", "growth-team"],
  ["2026-09-30 15:30:00", "4.11.0", "dashboard", "CSV export", "dev-team"],
  ["2026-10-13 15:40:00", "4.12.0", "signup-web", "Signup form redesign: new multi-step mobile stepper", "growth-team"],
  ["2026-10-16 11:10:00", "4.12.1", "marketing-site", "Fix pricing toggle copy", "web-team"],
];
const pricing = [
  ["2026-01-01", "starter", 25],
  ["2026-01-01", "pro", 69],
  ["2026-06-01", "starter", 29],
  ["2026-06-01", "pro", 79],
];

// ---------- simulate ----------
const spendRows: string[] = [];
const accountRows: string[] = [];
const trackedAgg = new Map<string, number>(); // date|channel|device -> tracked signups
const sessionAgg = new Map<string, number>(); // date|channel|device|page -> sessions
const eventAgg = new Map<string, number>(); // date|event|device -> count
let accountId = 50_000;
const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

const weekly = [1.0, 1.04, 1.05, 1.03, 0.97, 0.74, 0.7]; // Mon..Sun

days.forEach((ms, i) => {
  const date = iso(ms);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;
  const base = 330 * weekly[dow] * (1 + 0.003 * (i / 7)) * (HOLIDAYS[date] ?? 1);
  const budgetCut = date >= BUDGET_CUT;

  // Ad platform: spend, impressions, clicks per campaign.
  for (const c of campaigns) {
    const budget = budgetCut && c.id === 101 ? 500 : c.id === 301 && date >= "2026-09-28" ? 250 : c.id === 202 && date < "2026-09-15" ? 0 : c.budget;
    if (budget === 0) continue;
    const spend = budget * (0.93 + 0.06 * rand()) * (HOLIDAYS[date] ? 0.95 : 1);
    const clicks = noisy(spend / c.cpc, 0.05);
    const ctr = c.channel === "paid_search" ? 0.07 : c.channel === "display" ? 0.004 : 0.012;
    spendRows.push([date, c.id, spend.toFixed(2), noisy(clicks / ctr, 0.04), clicks].join("\t"));
  }

  for (const ch of Object.keys(CHANNEL_SHARE) as Channel[]) {
    let mult = 1;
    if (ch === "paid_search_brand" && budgetCut) mult = 500 / 1200 + 0.12; // budget-limited, some organic brand recapture
    for (const device of ["desktop", "mobile"] as const) {
      const share = device === "mobile" ? MOBILE_SHARE : 1 - MOBILE_SHARE;
      const real = noisy(base * CHANNEL_SHARE[ch] * mult * share, 0.07);

      // Sessions by landing page (sessions drive conversions; tracking does not affect them).
      const pages = LANDING[ch];
      pages.forEach((page, pi) => {
        const w = pi === 0 ? 0.6 : 0.4 / (pages.length - 1 || 1);
        const s = noisy(((real / CONV_RATE[ch]) * (pages.length === 1 ? 1 : w)), 0.05);
        bump(sessionAgg, `${date}|${REPORTED_CHANNEL[ch]}|${device}|${page}`, s);
      });

      // Backend accounts (truth) + analytics tracking (what the dashboard sees).
      let tracked = 0;
      let formSubmits = 0;
      for (let n = 0; n < real; n++) {
        const minute = Math.floor(rand() * 1440);
        const ts = `${date} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`;
        const plan = rand() < 0.72 ? "trial_starter" : "trial_pro";
        accountRows.push([accountId++, ts, plan, REPORTED_CHANNEL[ch], device, pick(COUNTRIES)].join("\t"));

        const afterRelease = date > RELEASE_DAY || (date === RELEASE_DAY && minute >= 15 * 60 + 40);
        const capture = device === "mobile" && afterRelease ? MOBILE_CAPTURE_AFTER : 0.985;
        formSubmits++;
        if (rand() < capture) tracked++;
      }
      bump(trackedAgg, `${date}|${REPORTED_CHANNEL[ch]}|${device}`, tracked);
      bump(eventAgg, `${date}|signup_form_submit|${device}`, formSubmits);
      bump(eventAgg, `${date}|trial_signup|${device}`, tracked);
      bump(eventAgg, `${date}|signup_form_view|${device}`, noisy(formSubmits / 0.38, 0.04));
    }
  }
});

// ---------- write SQL ----------
const copy = (table: string, cols: string, rows: string[]) => `COPY ${table} (${cols}) FROM stdin;\n${rows.join("\n")}\n\\.\n`;
const mapRows = (m: Map<string, number>) => [...m].map(([k, v]) => [...k.split("|"), v].join("\t"));
const tsv = (rows: (string | number)[][]) => rows.map((r) => r.join("\t"));

const adsdb = `-- Generated by scripts/generate-data.ts. Do not edit by hand.
CREATE DATABASE adsdb;
\\connect adsdb

CREATE TABLE campaigns (
  campaign_id   integer PRIMARY KEY,
  campaign_name text NOT NULL,
  channel       text NOT NULL,
  platform      text NOT NULL,
  objective     text NOT NULL
);
CREATE TABLE ad_spend_daily (
  spend_date   date    NOT NULL,
  campaign_id  integer NOT NULL REFERENCES campaigns,
  spend_usd    numeric(10,2) NOT NULL,
  impressions  integer NOT NULL,
  clicks       integer NOT NULL,
  PRIMARY KEY (spend_date, campaign_id)
);
CREATE TABLE ad_change_log (
  changed_at   timestamp NOT NULL,
  campaign_id  integer   NOT NULL REFERENCES campaigns,
  change_type  text NOT NULL,
  old_value    text,
  new_value    text,
  changed_by   text NOT NULL
);

${copy("campaigns", "campaign_id, campaign_name, channel, platform, objective", tsv(campaigns.map((c) => [c.id, c.name, c.channel, c.platform, c.objective])))}
${copy("ad_spend_daily", "spend_date, campaign_id, spend_usd, impressions, clicks", spendRows)}
${copy("ad_change_log", "changed_at, campaign_id, change_type, old_value, new_value, changed_by", tsv(adChanges as (string | number)[][]))}
`;

const appdb = `-- Generated by scripts/generate-data.ts. Do not edit by hand.
CREATE DATABASE appdb;
\\connect appdb

-- Backend source of truth: one row per trial account created.
CREATE TABLE accounts (
  account_id     integer PRIMARY KEY,
  created_at     timestamp NOT NULL,
  plan           text NOT NULL,
  signup_channel text NOT NULL,
  device         text NOT NULL,
  country        text NOT NULL
);
-- What the marketing dashboard reports: trial_signup analytics events per day.
CREATE TABLE trial_signups_daily (
  signup_date date    NOT NULL,
  channel     text    NOT NULL,
  device      text    NOT NULL,
  signups     integer NOT NULL,
  PRIMARY KEY (signup_date, channel, device)
);
CREATE TABLE tracking_events_daily (
  event_date  date    NOT NULL,
  event_name  text    NOT NULL,
  device      text    NOT NULL,
  event_count integer NOT NULL,
  PRIMARY KEY (event_date, event_name, device)
);
CREATE TABLE sessions_daily (
  session_date date    NOT NULL,
  channel      text    NOT NULL,
  device       text    NOT NULL,
  landing_page text    NOT NULL,
  sessions     integer NOT NULL,
  PRIMARY KEY (session_date, channel, device, landing_page)
);
CREATE TABLE release_log (
  released_at timestamp NOT NULL,
  version     text NOT NULL,
  component   text NOT NULL,
  description text NOT NULL,
  team        text NOT NULL
);
CREATE TABLE pricing_history (
  effective_date    date    NOT NULL,
  plan              text    NOT NULL,
  monthly_price_usd integer NOT NULL
);

${copy("accounts", "account_id, created_at, plan, signup_channel, device, country", accountRows)}
${copy("trial_signups_daily", "signup_date, channel, device, signups", mapRows(trackedAgg))}
${copy("tracking_events_daily", "event_date, event_name, device, event_count", mapRows(eventAgg))}
${copy("sessions_daily", "session_date, channel, device, landing_page, sessions", mapRows(sessionAgg))}
${copy("release_log", "released_at, version, component, description, team", tsv(releases as (string | number)[][]))}
${copy("pricing_history", "effective_date, plan, monthly_price_usd", tsv(pricing as (string | number)[][]))}
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "01-adsdb.sql"), adsdb.replaceAll("\r\n", "\n"));
writeFileSync(join(OUT, "02-appdb.sql"), appdb.replaceAll("\r\n", "\n"));

// ---------- summary, to check the planted story lands where intended ----------
const sumWeek = (m: Map<string, number>, from: string, to: string, filter = (_k: string) => true) =>
  [...m].filter(([k]) => k.slice(0, 10) >= from && k.slice(0, 10) <= to && filter(k)).reduce((a, [, v]) => a + v, 0);
const backendWeek = (from: string, to: string) => accountRows.filter((r) => { const d = r.split("\t")[1].slice(0, 10); return d >= from && d <= to; }).length;
const prevT = sumWeek(trackedAgg, "2026-10-05", "2026-10-11");
const lastT = sumWeek(trackedAgg, "2026-10-12", "2026-10-18");
const prevB = backendWeek("2026-10-05", "2026-10-11");
const lastB = backendWeek("2026-10-12", "2026-10-18");
const pct = (a: number, b: number) => `${(((b - a) / a) * 100).toFixed(1)}%`;
console.log(`accounts rows: ${accountRows.length}, spend rows: ${spendRows.length}`);
console.log(`tracked signups  5-11 Oct: ${prevT}  12-18 Oct: ${lastT}  change ${pct(prevT, lastT)}`);
console.log(`backend accounts 5-11 Oct: ${prevB}  12-18 Oct: ${lastB}  change ${pct(prevB, lastB)}`);
console.log(`wrote ${OUT}`);
