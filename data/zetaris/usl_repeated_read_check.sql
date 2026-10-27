-- =============================================================================
-- Does the repeated-read bug (docs/ZETARIS_FINDINGS.md section 1) reach USL tables?
-- Each query reads one table twice with different week filters (two CTEs).
-- Truth: tracked signups prior week 2160, last week 1771; ad spend prior 21556.18, last 17211.53.
-- =============================================================================

-- R1. Raw JDBC table, two CTEs: the known bug.
WITH l AS (SELECT sum(signups) AS s FROM app_pg.trial_signups_daily WHERE signup_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'),
     p AS (SELECT sum(signups) AS s FROM app_pg.trial_signups_daily WHERE signup_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-11')
SELECT (SELECT s FROM l) AS last_week, (SELECT s FROM p) AS prior_week;

-- R2. USL table with an aggregating activation (signups_by_channel), same shape.
WITH l AS (SELECT sum(tracked_signups) AS s FROM lightning.metastore.whybot_usl.growth.signups_by_channel WHERE signup_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'),
     p AS (SELECT sum(tracked_signups) AS s FROM lightning.metastore.whybot_usl.growth.signups_by_channel WHERE signup_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-11')
SELECT (SELECT s FROM l) AS last_week, (SELECT s FROM p) AS prior_week;

-- R3. USL table with a plain projection activation (ad_daily over ads_pg.ad_spend_daily), same shape.
WITH l AS (SELECT sum(spend_usd) AS s FROM lightning.metastore.whybot_usl.growth.ad_daily WHERE spend_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'),
     p AS (SELECT sum(spend_usd) AS s FROM lightning.metastore.whybot_usl.growth.ad_daily WHERE spend_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-11')
SELECT (SELECT s FROM l) AS last_week, (SELECT s FROM p) AS prior_week;

-- R4. Raw JDBC ad spend table, two CTEs: the bug again, for the same table R3 wraps.
WITH l AS (SELECT sum(spend_usd) AS s FROM ads_pg.ad_spend_daily WHERE spend_date BETWEEN DATE '2026-10-12' AND DATE '2026-10-18'),
     p AS (SELECT sum(spend_usd) AS s FROM ads_pg.ad_spend_daily WHERE spend_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-11')
SELECT (SELECT s FROM l) AS last_week, (SELECT s FROM p) AS prior_week;

-- R5. Raw JDBC table read once (single pass), for the truth.
SELECT sum(CASE WHEN spend_date >= DATE '2026-10-12' THEN spend_usd END) AS last_week, sum(CASE WHEN spend_date < DATE '2026-10-12' THEN spend_usd END) AS prior_week
FROM ads_pg.ad_spend_daily WHERE spend_date BETWEEN DATE '2026-10-05' AND DATE '2026-10-18';
