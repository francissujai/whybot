-- =============================================================================
-- WhyBot Unified Semantic Layer: lightning.metastore.whybot_usl.growth
--
-- One governed model over the three federated sources registered by
-- whybot_create.sql (ads_pg, app_pg, holidays_rest), shaped for the question
-- "why did trial signups move?": daily ad spend per campaign, the signup
-- funnel per device, signups vs accounts per channel and device, and holidays.
--
-- Run (needs the admin key, ZETARIS_API_KEY in .env):
--   npm run zetaris:usl
-- To start again: npm run zetaris:usl -- data/zetaris/usl_drop.sql
--
-- Zetaris notes: the COMPILE statement with several CREATE TABLEs must reach
-- Zetaris as ONE request (scripts/zetaris-usl.ts keeps it together). Every
-- activation reads each source table once (see docs/ZETARIS_FINDINGS.md: a
-- table read twice in one query returns the first read's rows).
-- =============================================================================

-- Step 0: namespaces. The parent must exist before the child.
CREATE NAMESPACE IF NOT EXISTS lightning.metastore;
CREATE NAMESPACE IF NOT EXISTS lightning.metastore.whybot_usl;

-- Step 1: the model. Keys are declared so Zetaris generates PK/FK checks.
-- Composite natural keys (day + campaign, day + device, ...) are folded into
-- one string key, because RUN DQ checks one key column at a time.
COMPILE USL growth DEPLOY NAMESPACE lightning.metastore.whybot_usl DDL
CREATE TABLE campaign (
    campaign_id int NOT NULL PRIMARY KEY,
    campaign_name varchar(100),
    channel varchar(30),
    platform varchar(30),
    objective varchar(30)
);
CREATE TABLE ad_daily (
    ad_day_key varchar(30) NOT NULL PRIMARY KEY,
    spend_date date,
    campaign_id int FOREIGN KEY REFERENCES campaign(campaign_id),
    spend_usd decimal(10,2),
    impressions int,
    clicks int
);
CREATE TABLE holiday (
    holiday_date date NOT NULL PRIMARY KEY,
    holiday_names varchar(200),
    is_federal int
);
CREATE TABLE funnel_daily (
    funnel_key varchar(30) NOT NULL PRIMARY KEY,
    event_date date,
    device varchar(10),
    form_views int,
    form_submits int,
    tracked_signups int,
    accounts_created int
);
CREATE TABLE signups_by_channel (
    channel_day_key varchar(50) NOT NULL PRIMARY KEY,
    signup_date date,
    channel varchar(30),
    device varchar(10),
    tracked_signups int,
    accounts_created int
);

-- Step 2: activate each table over the federated sources.
-- campaign: straight from the ad platform export.
ACTIVATE USL TABLE lightning.metastore.whybot_usl.growth.campaign AS
SELECT COALESCE(CAST(campaign_id AS INT), 0) AS campaign_id, campaign_name, channel, platform, objective
FROM ads_pg.campaigns;

-- ad_daily: one row per campaign per day.
ACTIVATE USL TABLE lightning.metastore.whybot_usl.growth.ad_daily AS
SELECT COALESCE(concat(CAST(spend_date AS STRING), '-', CAST(campaign_id AS STRING)), '') AS ad_day_key,
       spend_date, CAST(campaign_id AS INT) AS campaign_id, CAST(spend_usd AS DECIMAL(10,2)) AS spend_usd,
       CAST(impressions AS INT) AS impressions, CAST(clicks AS INT) AS clicks
FROM ads_pg.ad_spend_daily;

-- holiday: the live canada-holidays.ca API can return two holidays on one day
-- (30 Sep: Truth and Reconciliation + Orange Shirt Day), so fold them into one
-- row per date to keep holiday_date a real key.
ACTIVATE USL TABLE lightning.metastore.whybot_usl.growth.holiday AS
SELECT COALESCE(holiday_date, DATE '1970-01-01') AS holiday_date,
       CAST(concat_ws(' / ', sort_array(collect_list(holiday_name))) AS STRING) AS holiday_names,
       CAST(max(is_federal) AS INT) AS is_federal
FROM whybot.ca_holidays
GROUP BY holiday_date;

-- funnel_daily: analytics events pivoted in one pass, joined to backend
-- accounts (a different table, so no repeated read).
ACTIVATE USL TABLE lightning.metastore.whybot_usl.growth.funnel_daily AS
SELECT COALESCE(concat(CAST(e.event_date AS STRING), '-', e.device), '') AS funnel_key,
       e.event_date, e.device,
       CAST(e.form_views AS INT) AS form_views, CAST(e.form_submits AS INT) AS form_submits,
       CAST(e.tracked_signups AS INT) AS tracked_signups, CAST(COALESCE(a.accounts, 0) AS INT) AS accounts_created
FROM (SELECT event_date, device,
             sum(CASE WHEN event_name = 'signup_form_view' THEN event_count ELSE 0 END) AS form_views,
             sum(CASE WHEN event_name = 'signup_form_submit' THEN event_count ELSE 0 END) AS form_submits,
             sum(CASE WHEN event_name = 'trial_signup' THEN event_count ELSE 0 END) AS tracked_signups
      FROM app_pg.tracking_events_daily GROUP BY event_date, device) e
LEFT JOIN (SELECT to_date(created_at) AS d, device, count(*) AS accounts
           FROM app_pg.accounts GROUP BY to_date(created_at), device) a
  ON e.event_date = a.d AND e.device = a.device;

-- signups_by_channel: the dashboard metric next to the backend truth, per channel and device.
ACTIVATE USL TABLE lightning.metastore.whybot_usl.growth.signups_by_channel AS
SELECT COALESCE(concat(CAST(t.signup_date AS STRING), '-', t.channel, '-', t.device), '') AS channel_day_key,
       t.signup_date, t.channel, t.device,
       CAST(t.signups AS INT) AS tracked_signups, CAST(COALESCE(a.accounts, 0) AS INT) AS accounts_created
FROM app_pg.trial_signups_daily t
LEFT JOIN (SELECT to_date(created_at) AS d, signup_channel, device, count(*) AS accounts
           FROM app_pg.accounts GROUP BY to_date(created_at), signup_channel, device) a
  ON t.signup_date = a.d AND t.channel = a.signup_channel AND t.device = a.device;

-- Step 3: data quality.
-- tracked_not_above_submits: the trial_signup event fires after a form submit,
-- so a day where tracked signups exceed submits means double-firing events.
REGISTER DQ tracked_not_above_submits TABLE lightning.metastore.whybot_usl.growth.funnel_daily AS
tracked_signups <= form_submits;

-- tracking_coverage_90: the analytics event should capture at least 90% of the
-- accounts the backend actually created. Days that fail are measurement
-- problems, not demand problems.
REGISTER DQ tracking_coverage_90 TABLE lightning.metastore.whybot_usl.growth.funnel_daily AS
tracked_signups >= 0.9 * accounts_created;

-- non_negative_spend: ad spend and clicks can never be negative.
REGISTER DQ non_negative_spend TABLE lightning.metastore.whybot_usl.growth.ad_daily AS
spend_usd >= 0 AND clicks >= 0 AND impressions >= 0;

LIST DQ USL lightning.metastore.whybot_usl.growth;

RUN DQ tracked_not_above_submits TABLE lightning.metastore.whybot_usl.growth.funnel_daily;
RUN DQ tracking_coverage_90 TABLE lightning.metastore.whybot_usl.growth.funnel_daily;
RUN DQ non_negative_spend TABLE lightning.metastore.whybot_usl.growth.ad_daily;

-- Generated key checks: the folded holiday key and the campaign foreign key.
RUN DQ holiday_date TABLE lightning.metastore.whybot_usl.growth.holiday;
RUN DQ campaign_id TABLE lightning.metastore.whybot_usl.growth.ad_daily;

-- The days that fail coverage: which device, from when.
SHOW DQ INVALID RECORD tracking_coverage_90 TABLE lightning.metastore.whybot_usl.growth.funnel_daily;
