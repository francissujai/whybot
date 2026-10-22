-- =============================================================================
-- WhyBot: register the demo sources in Zetaris. Three sources, federated:
--   ads_pg        Postgres adsdb  (ad platform export)
--   app_pg        Postgres appdb  (product analytics + backend accounts)
--   holidays_rest canada-holidays.ca REST API (real public holidays)
--
-- Run from zetaris-getting-started/ (needs ZETARIS_API_KEY in its .env.local):
--   python scripts/run_sql.py ../data/zetaris/whybot_create.sql --dry-run
--   python scripts/run_sql.py ../data/zetaris/whybot_create.sql
-- Re-run with --skip-exists.
--
-- whybot-pg is the container from data/docker-compose.yml on the
-- zetaris_default network. The password is the local-only dev default; change
-- both places if you set WHYBOT_PG_PASSWORD.
-- =============================================================================

CREATE DATASOURCE ads_pg DESCRIBE BY "Ad platform export - campaigns, spend, change log" OPTIONS (
  jdbcdriver "org.postgresql.Driver",
  jdbcurl "jdbc:postgresql://whybot-pg:5432/adsdb",
  username "whybot",
  password "whybot_local_dev",
  fetchsize "1000"
);

REGISTER DATASOURCE TABLES FROM ads_pg;

CREATE DATASOURCE app_pg DESCRIBE BY "Product analytics and backend accounts" OPTIONS (
  jdbcdriver "org.postgresql.Driver",
  jdbcurl "jdbc:postgresql://whybot-pg:5432/appdb",
  username "whybot",
  password "whybot_local_dev",
  fetchsize "1000"
);

REGISTER DATASOURCE TABLES FROM app_pg;

CREATE LIGHTNING DATABASE HOLIDAYS_REST DESCRIBE BY "Canada public holidays - canada-holidays.ca";

CREATE SCHEMASTORE CONTAINER whybot;

CREATE LIGHTNING REST TABLE ca_holidays_2026 FROM HOLIDAYS_REST REQUEST(
    endpoint "https://canada-holidays.ca/api/v1/holidays?year=2026",
    method "get",
    response_type "json",
    http_encoding "URLENCODED"
) HEADER (
) BODY ();

CREATE SCHEMASTORE VIEW ca_holidays WITH CONTAINER whybot AS
SELECT
    CAST(h.`date` AS DATE) AS holiday_date,
    h.`nameEn` AS holiday_name,
    h.federal AS is_federal
FROM holidays_rest.ca_holidays_2026
LATERAL VIEW explode(holidays) AS h;
