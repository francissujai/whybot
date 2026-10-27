-- =============================================================================
-- Queries through the active WhyBot USL (lightning.metastore.whybot_usl.growth).
-- Run after usl_create.sql:  npm run zetaris:usl
-- Each query names USL tables only; Zetaris resolves them to ads_pg, app_pg
-- and the live holidays REST table underneath.
-- =============================================================================

-- U1. Is the 18% drop real? Dashboard (tracked) vs backend (created) per device, prior vs last week, in one pass over funnel_daily.
SELECT device,
       sum(CASE WHEN event_date < DATE '2026-10-12' THEN tracked_signups END) AS tracked_prior,
       sum(CASE WHEN event_date >= DATE '2026-10-12' THEN tracked_signups END) AS tracked_last,
       sum(CASE WHEN event_date < DATE '2026-10-12' THEN accounts_created END) AS created_prior,
       sum(CASE WHEN event_date >= DATE '2026-10-12' THEN accounts_created END) AS created_last,
       round(sum(CASE WHEN event_date >= DATE '2026-10-12' THEN tracked_signups END) / sum(CASE WHEN event_date >= DATE '2026-10-12' THEN accounts_created END), 3) AS coverage_last
FROM lightning.metastore.whybot_usl.growth.funnel_daily
WHERE event_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
GROUP BY device
ORDER BY device;

-- U2. Cross-source, day by day: paid-search spend (ads_pg) next to paid-search accounts created (app_pg) and the holiday calendar (REST API).
SELECT s.spend_date, date_format(s.spend_date, 'E') AS dow, s.paid_search_spend, a.paid_search_accounts, h.holiday_names
FROM (SELECT d.spend_date, round(sum(d.spend_usd), 2) AS paid_search_spend
      FROM lightning.metastore.whybot_usl.growth.ad_daily d
      JOIN lightning.metastore.whybot_usl.growth.campaign c ON d.campaign_id = c.campaign_id
      WHERE c.channel = 'paid_search' AND d.spend_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
      GROUP BY d.spend_date) s
JOIN (SELECT signup_date, sum(accounts_created) AS paid_search_accounts
      FROM lightning.metastore.whybot_usl.growth.signups_by_channel
      WHERE channel = 'paid_search' AND signup_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
      GROUP BY signup_date) a ON s.spend_date = a.signup_date
LEFT JOIN lightning.metastore.whybot_usl.growth.holiday h ON s.spend_date = h.holiday_date
ORDER BY s.spend_date;

-- U3. Which channels really lost accounts? Backend accounts per channel, prior vs last week, with the tracked figure beside it.
SELECT channel,
       sum(CASE WHEN signup_date < DATE '2026-10-12' THEN accounts_created END) AS created_prior,
       sum(CASE WHEN signup_date >= DATE '2026-10-12' THEN accounts_created END) AS created_last,
       sum(CASE WHEN signup_date >= DATE '2026-10-12' THEN accounts_created END) - sum(CASE WHEN signup_date < DATE '2026-10-12' THEN accounts_created END) AS created_change,
       sum(CASE WHEN signup_date >= DATE '2026-10-12' THEN tracked_signups END) - sum(CASE WHEN signup_date < DATE '2026-10-12' THEN tracked_signups END) AS tracked_change
FROM lightning.metastore.whybot_usl.growth.signups_by_channel
WHERE signup_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18'
GROUP BY channel
ORDER BY created_change;
