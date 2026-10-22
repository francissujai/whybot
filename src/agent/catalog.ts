// What WhyBot knows about the data before it runs a query. Table names are the
// Zetaris-qualified names created by data/zetaris/whybot_create.sql.

import { env } from "../env.ts";

export const CATALOG = `
SOURCE ads_pg (ad platform export, Postgres via Zetaris JDBC)
  ads_pg.campaigns(campaign_id int, campaign_name string, channel string, platform string, objective string)
    channel is paid_search | paid_social | display. 101 = "Brand Search - North America".
  ads_pg.ad_spend_daily(spend_date date, campaign_id int, spend_usd decimal, impressions int, clicks int)
  ads_pg.ad_change_log(changed_at timestamp, campaign_id int, change_type string, old_value string, new_value string, changed_by string)
    change_type: daily_budget | bid_strategy | status | creative

SOURCE app_pg (product analytics + backend, Postgres via Zetaris JDBC)
  app_pg.trial_signups_daily(signup_date date, channel string, device string, signups int)
    THE DASHBOARD METRIC. Counted from the analytics event trial_signup. channel: paid_search | paid_social | display | organic | direct | referral | email. device: desktop | mobile.
  app_pg.accounts(account_id int, created_at timestamp, plan string, signup_channel string, device string, country string)
    Backend source of truth: one row per trial account actually created. Use to_date(created_at) for the day.
  app_pg.tracking_events_daily(event_date date, event_name string, device string, event_count int)
    event_name: signup_form_view | signup_form_submit | trial_signup
  app_pg.sessions_daily(session_date date, channel string, device string, landing_page string, sessions int)
  app_pg.release_log(released_at timestamp, version string, component string, description string, team string)
  app_pg.pricing_history(effective_date date, plan string, monthly_price_usd int)

SOURCE holidays_rest (live REST API: canada-holidays.ca, via a Zetaris REST table)
  whybot.ca_holidays(holiday_date date, holiday_name string, is_federal int)
    Canadian public holidays for 2026. is_federal = 1 for national holidays.
`.trim();

export const SQL_RULES = `
Zetaris Lightning SQL uses the Spark SQL dialect:
- One read-only statement (SELECT / WITH / SHOW / DESCRIBE). No semicolon.
- Always use the qualified names above. Joins across sources are allowed (Zetaris federates them).
- Dates: DATE '2026-10-12', to_date(ts), date_format(d, 'E') for weekday, datediff(a, b), date_sub(d, n).
- Aggregate in SQL and return at most 50 rows. Round ratios with round(x, 3).
- Read each table at most once per query (no self-joins, no two CTEs over one table): Zetaris returns wrong rows for repeated reads. Compare periods in one pass with SUM(CASE WHEN ... THEN ... END).
- Timestamps (created_at, changed_at, released_at): filter with to_date(col) BETWEEN DATE '...' AND DATE '...'.
`.trim();

/** The investigation's "today". Data ends on Sun 18 Oct 2026. */
export function asOf(): { today: string; lastWeek: [string, string]; priorWeek: [string, string] } {
  const today = env("WHYBOT_AS_OF", "2026-10-19");
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  const monday = new Date(d.getTime() - dow * 86_400_000);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const lastMon = monday.getTime() - 7 * 86_400_000;
  return {
    today,
    lastWeek: [iso(lastMon), iso(lastMon + 6 * 86_400_000)],
    priorWeek: [iso(lastMon - 7 * 86_400_000), iso(lastMon - 86_400_000)],
  };
}
