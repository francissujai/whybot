// Demo helper: shows the investigation's key facts straight from Zetaris, with
// no model involved. Each query reads from a different federated source.
//
//   npm run demo:facts

import { ZetarisClient } from "../src/zetaris/client.ts";

const z = new ZetarisClient();
const facts: [string, string][] = [
  [
    "1. The dashboard metric vs the backend truth (app_pg: trial_signups_daily vs accounts)",
    `SELECT 'dashboard (tracked events)' AS source,
            sum(CASE WHEN signup_date <  DATE '2026-10-12' THEN signups END) AS week_before,
            sum(CASE WHEN signup_date >= DATE '2026-10-12' THEN signups END) AS last_week,
            round(100.0 * (sum(CASE WHEN signup_date >= DATE '2026-10-12' THEN signups END) - sum(CASE WHEN signup_date < DATE '2026-10-12' THEN signups END)) / sum(CASE WHEN signup_date < DATE '2026-10-12' THEN signups END), 1) AS pct_change
     FROM app_pg.trial_signups_daily WHERE signup_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'`,
  ],
  [
    "",
    `SELECT 'backend (real accounts)' AS source,
            sum(CASE WHEN to_date(created_at) <  DATE '2026-10-12' THEN 1 END) AS week_before,
            sum(CASE WHEN to_date(created_at) >= DATE '2026-10-12' THEN 1 END) AS last_week,
            round(100.0 * (sum(CASE WHEN to_date(created_at) >= DATE '2026-10-12' THEN 1 END) - sum(CASE WHEN to_date(created_at) < DATE '2026-10-12' THEN 1 END)) / sum(CASE WHEN to_date(created_at) < DATE '2026-10-12' THEN 1 END), 1) AS pct_change
     FROM app_pg.accounts WHERE to_date(created_at) BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'`,
  ],
  [
    "2. Mobile tracking after release 4.12.0: form submits vs tracked signups (app_pg.tracking_events_daily)",
    `SELECT event_date,
            sum(CASE WHEN event_name = 'signup_form_submit' THEN event_count END) AS mobile_form_submits,
            sum(CASE WHEN event_name = 'trial_signup' THEN event_count END) AS mobile_tracked_signups
     FROM app_pg.tracking_events_daily
     WHERE device = 'mobile' AND event_date BETWEEN DATE '2026-10-09' AND DATE '2026-10-18'
     GROUP BY event_date ORDER BY event_date`,
  ],
  ["   What shipped (app_pg.release_log)", `SELECT released_at, version, component, description FROM app_pg.release_log WHERE to_date(released_at) >= DATE '2026-10-01' ORDER BY released_at`],
  ["3. Ad platform changes (ads_pg.ad_change_log + campaigns)", `SELECT l.changed_at, c.campaign_name, l.change_type, l.old_value, l.new_value FROM ads_pg.ad_change_log l JOIN ads_pg.campaigns c ON c.campaign_id = l.campaign_id WHERE to_date(l.changed_at) >= DATE '2026-10-01' ORDER BY l.changed_at`],
  [
    "4. Holidays from a live REST API, joined to signups (whybot.ca_holidays x app_pg)",
    `SELECT a.d AS day, date_format(a.d, 'E') AS weekday, a.accounts, h.holiday_name
     FROM (SELECT to_date(created_at) AS d, count(*) AS accounts FROM app_pg.accounts WHERE to_date(created_at) BETWEEN DATE '2026-10-09' AND DATE '2026-10-14' GROUP BY to_date(created_at)) a
     LEFT JOIN whybot.ca_holidays h ON h.holiday_date = a.d ORDER BY a.d`,
  ],
];

const pad = (v: unknown, w: number) => String(v ?? "").slice(0, w).padEnd(w);
for (const [title, sql] of facts) {
  if (title) console.log(`\n${title}`);
  const r = await z.run(sql);
  const widths = r.columns.map((c, i) => Math.min(48, Math.max(c.length, ...r.rows.map((row) => String(row[i] ?? "").length))));
  console.log("  " + r.columns.map((c, i) => pad(c, widths[i])).join("  "));
  for (const row of r.rows) console.log("  " + row.map((v, i) => pad(v, widths[i])).join("  "));
  console.log(`  (${r.ms} ms via Zetaris)`);
}
