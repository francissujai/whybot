# Zetaris findings from building WhyBot

Found while building WhyBot against a local Zetaris 2.4.3.1 install (Docker bundle from Zetaris Cloud, October 2026). The JDBC source is Postgres 16.

## 1. Reading the same JDBC table twice in one query returns the first read's rows for both

**Severity:** silent wrong results. The numbers look plausible and no error is raised.

**Setup:** `app_pg` is a JDBC datasource (`org.postgresql.Driver`), and `trial_signups_daily` is registered with `REGISTER DATASOURCE TABLES FROM app_pg`.

**Reproduce:** each query compares two weeks of the same table.

| Shape | SQL (abridged) | Zetaris result | Postgres truth |
|---|---|---|---|
| Two CTEs | `WITH l AS (SELECT … WHERE signup_date BETWEEN '2026-10-12' AND '2026-10-18'), p AS (SELECT … WHERE signup_date BETWEEN '2026-10-05' AND '2026-10-11') SELECT (SELECT sum(signups) FROM l), (SELECT sum(signups) FROM p)` | 1771, **1771** | 1771, 2160 |
| Two aggregated CTEs, joined | `WITH l AS (… GROUP BY device), p AS (… GROUP BY device) SELECT … FROM l JOIN p` | desktop 1171 / **1171**, mobile 600 / **600** | 1171 / 1309, 600 / 851 |
| Two subqueries, joined | `SELECT … FROM (SELECT … WHERE last week …) l JOIN (SELECT … WHERE prior week …) p` | desktop 1171 / **1171**, mobile 600 / **600** | 1171 / 1309, 600 / 851 |
| Single pass (workaround) | `SELECT device, sum(CASE WHEN signup_date >= DATE '2026-10-12' THEN signups END), sum(CASE WHEN signup_date < DATE '2026-10-12' THEN signups END) … GROUP BY device` | 1171 / 1309, 600 / 851 ✓ | ✓ |

**Likely cause (unconfirmed):** the pushed-down JDBC scan for a table is cached or deduplicated without its filter in the key, so the second scan reuses the first scan's rows.

**Impact on agents:** an LLM agent writing natural comparative SQL (CTEs per period) gets "no change" between periods and draws confident wrong conclusions. WhyBot's first live run did exactly that.

**WhyBot's mitigation:** `src/zetaris/lint.ts` refuses any query that reads the same table more than once, before it reaches Zetaris, and tells the model how to rewrite it as a single pass. The rule also appears in the model's SQL guidance (`src/agent/catalog.ts`).

## 2. Everything comes back as strings over REST

`POST /api/v1.0/sql-editor/sqls/run` returns `{headers, data, total, timeUsed}`, with every value in `data` as a string, including counts and sums. WhyBot converts numeric strings in `normalise()` (`src/zetaris/client.ts`).

## 3. What worked well

- Federating two Postgres databases and a live REST API (canada-holidays.ca) behind one SQL endpoint, with joins across all three in a single query.
- REST tables over a wrapped JSON response (`{"holidays":[…]}`) with `LATERAL VIEW explode()` into a schemastore view.
- `SHOW TABLES IN <datasource>` and row counts that match the source exactly.
