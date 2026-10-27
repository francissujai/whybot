-- =============================================================================
-- MOCK of a proposed Zetaris feature (docs/ZETARIS_USL.md, section 2c).
-- The REGISTER DQ ... RECONCILE syntax below does NOT exist in Zetaris 2.4.3.1
-- and is kept in comments so this file still runs. The executable statement
-- at the end is what the rule would compute, written as a plain query that
-- does run today.
--
-- Proposed: a reconciliation rule that checks a USL table's aggregate against
-- an aggregate over the raw source, per group, and fails rows where they
-- differ. It would catch silent wrong results (for example the repeated-read
-- bug in docs/ZETARIS_FINDINGS.md) and activation drift.
--
--   REGISTER DQ accounts_match_backend
--     TABLE lightning.metastore.whybot_usl.growth.funnel_daily
--     RECONCILE sum(accounts_created) BY event_date
--     WITH SOURCE (SELECT to_date(created_at) AS event_date, count(*) AS v
--                  FROM app_pg.accounts GROUP BY to_date(created_at))
--     TOLERANCE 0;
--
--   RUN DQ accounts_match_backend TABLE lightning.metastore.whybot_usl.growth.funnel_daily;
--   -- would return: name | table | type = Reconcile | total_record | valid_record | invalid_record
--
-- Proposed USL DDL form, so the check travels with the model:
--
--   CREATE TABLE funnel_daily (
--       funnel_key varchar(30) NOT NULL PRIMARY KEY,
--       event_date date,
--       ...
--       accounts_created int RECONCILES WITH app_pg.accounts COUNT BY to_date(created_at) = event_date
--   );
-- =============================================================================

-- What the rule would compute, today: groups (days) where the USL disagrees with the backend source.
SELECT count(*) AS days_checked,
       sum(CASE WHEN u.v = s.v THEN 1 ELSE 0 END) AS days_matching,
       sum(CASE WHEN u.v <> s.v OR s.v IS NULL THEN 1 ELSE 0 END) AS days_mismatched,
       sum(u.v) AS usl_accounts, sum(s.v) AS source_accounts
FROM (SELECT event_date, sum(accounts_created) AS v FROM lightning.metastore.whybot_usl.growth.funnel_daily GROUP BY event_date) u
LEFT JOIN (SELECT to_date(created_at) AS event_date, count(*) AS v FROM app_pg.accounts GROUP BY to_date(created_at)) s
  ON u.event_date = s.event_date;
