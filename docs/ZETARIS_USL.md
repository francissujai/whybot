# WhyBot on the Zetaris Unified Semantic Layer

Everything in this document was run live on 27 October 2026 against a local Zetaris 2.4.3.1 install (Docker bundle from Zetaris Cloud), using the sources registered by [`data/zetaris/whybot_create.sql`](../data/zetaris/whybot_create.sql). The raw captured output of every run is in [`docs/zetaris-usl-output/`](zetaris-usl-output/). Anything that was not run live is marked **not verified**.

To reproduce (Zetaris running, sources registered, `ZETARIS_API_KEY` in `.env`):

```powershell
npm run zetaris:usl                                   # usl_create.sql, then usl_queries.sql
npm run zetaris:usl -- data/zetaris/explore_ads_pg.sql data/zetaris/explore_app_pg.sql data/zetaris/explore_holidays.sql
npm run zetaris:usl -- data/zetaris/usl_repeated_read_check.sql
npm run zetaris:compare                               # hand-coded equivalent vs the USL (needs npm run data:up)
npm run zetaris:usl -- data/zetaris/usl_drop.sql      # remove the model again
```

`scripts/zetaris-usl.ts` sends one statement per REST call to `POST /api/v1.0/sql-editor/sqls/run`, except that a `COMPILE USL` keeps the `CREATE TABLE` definitions that follow it, because Zetaris needs a multi-table compile as one request. Add `--md <file>` to save the results as Markdown.

---

## 1a. Use case and sources

**Use case.** A growth team sees trial signups down 18% week over week (2,160 to 1,771) and needs to know why before Monday's meeting. The answer spans three systems that are never in one place: the ad platform (spend, clicks, budget changes), the product (analytics events, backend accounts, release log, pricing) and the public-holiday calendar. WhyBot, an agent, investigates this with SQL through Zetaris. The USL gives that agent (and any analyst) one governed model of the growth funnel instead of nine raw tables.

| Source | Zetaris name | Kind | What it holds |
|---|---|---|---|
| Ad platform export | `ads_pg` | Postgres 16 over JDBC | `campaigns`, `ad_spend_daily` (398 rows), `ad_change_log` |
| Product analytics + backend | `app_pg` | Postgres 16 over JDBC | `trial_signups_daily` (dashboard metric), `accounts` (28,102 rows, backend truth), `tracking_events_daily`, `sessions_daily`, `release_log`, `pricing_history` |
| Canadian public holidays | `holidays_rest` → `whybot.ca_holidays` | Live REST API (canada-holidays.ca) via a Zetaris REST table and SchemaStore view | 31 holidays for 2026 on 21 distinct dates |

The two Postgres databases are synthetic but realistic, generated deterministically by `scripts/generate-data.ts` with known causes planted. The holidays are real.

## 1b. Exploratory queries and results

Files: [`explore_ads_pg.sql`](../data/zetaris/explore_ads_pg.sql), [`explore_app_pg.sql`](../data/zetaris/explore_app_pg.sql), [`explore_holidays.sql`](../data/zetaris/explore_holidays.sql). Each query has its question and result summary as a comment. Full output: [`explore_run.md`](zetaris-usl-output/explore_run.md). All nine succeeded.

**ads_pg**

| # | Question | Result |
|---|---|---|
| A1 | Spend and clicks by channel, prior week vs last week | paid_search spend 14,152.43 → 9,910.83 USD (−30%), clicks 7,926 → 4,683 (−41%). Display and paid_social flat. |
| A2 | What changed in the ad accounts in those two weeks? | 13 Oct 09:12: Brand Search – North America daily budget 1200 → 500 (ops-bot, "Q4 budget rebalance"). 14 Oct 11:45: Social – Retargeting creative carousel_v3 → video_v1. |
| A3 | Brand Search day by day around the change | ~1,080–1,190 USD and 776–968 clicks a day until 12 Oct; 465–491 USD and 331–368 clicks from 13 Oct. CPC stays 1.23–1.44, so clicks fell with budget, not price. |

**app_pg**

| # | Question | Result |
|---|---|---|
| P1 | Does the dashboard metric agree with backend accounts, by device and week? | Desktop: tracked 1,309 → 1,171, created 1,334 → 1,200 (gap 25 → 29). Mobile: tracked 851 → 600, created 871 → 800. **The mobile gap jumps from 20 to 200.** |
| P2 | Where in the funnel does mobile lose events? | Mobile `signup_form_submit` 871 → 800 (tracks accounts), mobile `trial_signup` 851 → 600. Desktop events move together. |
| P3 | What shipped in October, and did pricing change? | 4.12.0 signup-web "new multi-step mobile stepper" on 13 Oct 15:40; 4.12.1 on 16 Oct was a copy fix. Prices last changed 1 Jun 2026. |

**holidays_rest**

| # | Question | Result |
|---|---|---|
| H1 | Holidays Sep–Nov 2026 | Labour Day (7 Sep), Truth and Reconciliation + Orange Shirt Day (both 30 Sep), Thanksgiving (Mon 12 Oct, federal), Remembrance Day (11 Nov). |
| H2 | Holidays per month, federal count | 31 holidays, 12 federal, on 21 distinct dates. Several dates have more than one holiday, which shaped the USL `holiday` key (below). |
| H3 | Cross-source: daily accounts with a holiday flag | Weekdays 301–369 accounts; Thanksgiving Monday 278, then 301–328 for Tue–Fri. A one-day dip, not the week-long drop. |

## 1c. The USL: DDL, activation, active queries, data quality

### Model

File: [`data/zetaris/usl_create.sql`](../data/zetaris/usl_create.sql). Namespace `lightning.metastore.whybot_usl`, USL `growth`, five tables:

| Table | Grain | Keys | Activated over |
|---|---|---|---|
| `campaign` | one campaign | PK `campaign_id` | `ads_pg.campaigns` |
| `ad_daily` | campaign × day | PK `ad_day_key`; **FK `campaign_id` → `campaign`** | `ads_pg.ad_spend_daily` |
| `holiday` | one date | PK `holiday_date` | `whybot.ca_holidays` (REST), names folded per date |
| `funnel_daily` | device × day | PK `funnel_key` | `app_pg.tracking_events_daily` pivoted in one pass, joined to `app_pg.accounts` counts |
| `signups_by_channel` | channel × device × day | PK `channel_day_key` | `app_pg.trial_signups_daily` joined to `app_pg.accounts` counts |

Design decisions:

- **One string key per table.** The natural keys are composite (day + campaign, day + device). `RUN DQ` checks one key column, so each table carries a folded key such as `2026-10-14-mobile`.
- **Holidays folded per date.** The live API returns 31 holidays on 21 dates. Using `holiday_date` as the key directly would give 10 duplicate-key rows, so the activation groups by date and joins the names (`Orange Shirt Day / National Day for Truth and Reconciliation`). The generated PK check confirms it: 21 valid, 0 invalid.
- **Every activation reads each source table once**, because of the repeated-read bug in [ZETARIS_FINDINGS.md](ZETARIS_FINDINGS.md). The funnel pivot uses `SUM(CASE …)` rather than one subquery per event.
- **Explicit casts.** `SUM` returns a bigint and USL refuses to downcast silently, so counts are cast to `INT` in the activation query.

The compile, five activations and three DQ registrations all succeeded, and the script is re-runnable: a second full run re-deployed and re-activated without errors. Output: [`usl_run.md`](zetaris-usl-output/usl_run.md).

### Data quality

```sql
REGISTER DQ tracking_coverage_90 TABLE lightning.metastore.whybot_usl.growth.funnel_daily AS
tracked_signups >= 0.9 * accounts_created;

REGISTER DQ tracked_not_above_submits TABLE lightning.metastore.whybot_usl.growth.funnel_daily AS
tracked_signups <= form_submits;

REGISTER DQ non_negative_spend TABLE lightning.metastore.whybot_usl.growth.ad_daily AS
spend_usd >= 0 AND clicks >= 0 AND impressions >= 0;
```

`tracking_coverage_90` is the rule that matters for this use case: the analytics event behind the dashboard should capture at least 90% of the accounts the backend actually created. A day that fails is a measurement problem, not a demand problem.

`RUN DQ` results (live):

| Rule | Table | Type | Total | Valid | Invalid |
|---|---|---|---|---|---|
| `tracking_coverage_90` | funnel_daily | Custom | 182 | 176 | **6** |
| `tracked_not_above_submits` | funnel_daily | Custom | 182 | 182 | 0 |
| `non_negative_spend` | ad_daily | Custom | 398 | 398 | 0 |
| `holiday_date` | holiday | Primary key | 21 | 21 | 0 |
| `campaign_id` | ad_daily | Foreign key | 398 | 398 | 0 |

`SHOW DQ INVALID RECORD tracking_coverage_90` returns the six failing rows: **mobile, 13 to 18 October**, the days after release 4.12.0. On 13 Oct (release at 15:40) coverage is 120/136 = 88%; from 14 Oct it is 61–76% (for example 96 of 127 on 14 Oct, 56 of 87 on 18 Oct). Desktop never fails. A data-quality rule alone points at the tracking break that explains about half of the 18% "drop".

`LIST DQ USL lightning.metastore.whybot_usl.growth` lists 9 constraints: five generated primary keys, one generated foreign key and the three custom rules.

### Queries through the active USL

File: [`data/zetaris/usl_queries.sql`](../data/zetaris/usl_queries.sql). They use USL table names only; Zetaris resolves them to the two Postgres databases and the REST API.

**U1. Is the drop real?** (`funnel_daily`)

| device | tracked_prior | tracked_last | created_prior | created_last | coverage_last |
|---|---|---|---|---|---|
| desktop | 1309 | 1171 | 1334 | 1200 | 0.976 |
| mobile | 851 | 600 | 871 | 800 | **0.75** |

Tracked signups fell 389 (−18.0%), but accounts created fell 205 (2,205 → 2,000, −9.3%). Mobile coverage dropped to 75%.

**U2. Paid-search spend vs paid-search accounts, with holidays** (`ad_daily` ⋈ `campaign` ⋈ `signups_by_channel` ⋈ `holiday`: ads_pg × app_pg × REST in one query)

| day | spend (USD) | paid-search accounts | holiday |
|---|---|---|---|
| Mon 5 Oct – Sun 11 Oct | 1,976–2,074 a day | 68–104 a day | none |
| Mon 12 Oct | 1,897.32 | 82 | Thanksgiving |
| Tue 13 Oct – Sun 18 Oct | 1,322–1,352 a day | 50–75 a day | none |

(All 14 rows are in [`usl_run.md`](zetaris-usl-output/usl_run.md).) Spend drops by about a third the day the budget was cut, and accounts follow.

**U3. Which channels really lost accounts?** (`signups_by_channel`)

| channel | created_prior | created_last | created_change | tracked_change |
|---|---|---|---|---|
| paid_search | 630 | 472 | **−158** | −190 |
| organic | 655 | 618 | −37 | −95 |
| referral | 116 | 106 | −10 | −23 |
| paid_social | 308 | 299 | −9 | −29 |
| display | 45 | 44 | −1 | −8 |
| email | 178 | 179 | +1 | −17 |
| direct | 273 | 282 | +9 | −27 |

Every channel looks down on the dashboard (tracked); in the backend, paid search accounts for 158 of the 205 real lost accounts.

---

## 2a. How the USL saved time, compared with a hand-coded approach

To compare honestly, [`scripts/handcoded-compare.ts`](../scripts/handcoded-compare.ts) answers U1–U3 without Zetaris. It connects to `adsdb` and `appdb` with the `pg` driver, calls the canada-holidays.ca API with `fetch`, joins in TypeScript, then runs the three USL queries and checks the answers match. Output: [`compare_run.txt`](zetaris-usl-output/compare_run.txt).

| | Hand-coded (TypeScript) | Zetaris USL |
|---|---|---|
| Same answers for U1, U2, U3 | yes | yes (checked by the script) |
| Lines of code (non-blank, non-comment) | 56 for the three questions | 73 for the model (DDL + activations), then 31 for the three questions |
| Wall clock, one warm run | 134–170 ms | 2.3–7.3 s (3 runs) |
| Setup | `pg` driver, two connection strings with credentials, holiday JSON shape, date and time-zone handling in code | sources registered once in Zetaris (`whybot_create.sql`, already needed by WhyBot), then `usl_create.sql` |
| Adding a fourth question | more TypeScript: new fetches, new joins, new maps | one more SELECT over the same five tables |
| Data quality | none unless written by hand | 3 custom rules + 6 generated key checks, with `SHOW DQ INVALID RECORD` |
| Who can use it | whoever runs this script | any SQL client, BI tool or agent with a Zetaris login |

For three fixed questions on small data, the hand-coded version is shorter and faster: it is one process talking straight to Postgres, while every USL query goes through Zetaris's REST API and Spark planning. The USL wins on everything after the first three questions:

- **Reuse.** The 73 lines are written once. WhyBot asks a different set of questions on every run, and the model's questions cannot be hand-coded in advance. With the USL it writes one SELECT against five well-named tables instead of joining nine raw tables across three sources.
- **Correctness by construction.** The repeated-read bug does not show up through USL tables in our tests (below). A hand-coded path does not have that bug either, but an agent writing SQL against raw Zetaris tables does.
- **Data quality comes with the model.** The tracking break was found by one registered rule; hand-coded, it would be another script.

Measured: lines of code, run time, matching answers. **Not measured:** developer time. Our estimate is that writing and debugging `handcoded-compare.ts` took about as long as `usl_create.sql` (under an hour each). The difference appears with each new question, which costs minutes in the USL and a code change by hand.

### The repeated-read bug and the USL (live)

File: [`usl_repeated_read_check.sql`](../data/zetaris/usl_repeated_read_check.sql), output [`repeated_read_run.md`](zetaris-usl-output/repeated_read_run.md). Each query reads one table twice with different week filters. Expected values: tracked signups 1,771 (last week) and 2,160 (prior); spend 17,211.53 and 21,556.18.

| # | Table read twice | Result | Correct? |
|---|---|---|---|
| R1 | raw `app_pg.trial_signups_daily` | 1771, 1771 | **no** (known bug) |
| R2 | USL `signups_by_channel` (aggregating activation) | 1771, 2160 | yes |
| R3 | USL `ad_daily` (plain projection activation) | 17211.53, 21556.18 | yes |
| R4 | raw `ads_pg.ad_spend_daily` | 17211.53, 17211.53 | **no** |
| R5 | raw `ads_pg.ad_spend_daily`, single pass | 17211.53, 21556.18 | yes |

Reading through the USL avoided the bug in every shape we tried, including a projection that is just a renamed source table. We have not found out why, and four shapes do not prove it in general.

## 2b. Would the USL help in real work?

**Yes where several teams ask many questions of the same few sources. No for one-off pulls.**

It would help:

- A **weekly growth review** at a SaaS company: ad platforms (Google Ads, Meta, LinkedIn exports in a warehouse), the product database, the CRM and a holiday or promotion calendar. Today an analyst rebuilds the same joins in notebooks every week and each team's numbers differ slightly. One USL model with `tracking_coverage`-style rules would give marketing, product and finance the same numbers, and would flag measurement breaks before anyone argues about them.
- **Agents.** An LLM writing SQL is far more reliable against five described, keyed tables than against dozens of raw ones, and the DQ rules give it a cheap first check ("is this drop a measurement problem?").

It would not help much:

- For a one-off question on one source (plain SQL is quicker), or when latency matters: queries took 0.5–1.5 s each through Zetaris here, against milliseconds directly in Postgres.
- Where REST sources change shape often, because activation queries flatten JSON and break when it changes (see 2c).

**Forecast for the weekly growth review (assumptions stated, not measured):**

| Assumption | Value |
|---|---|
| Analysts doing the weekly cross-source pull | 2 |
| Time each spends per week rebuilding joins and reconciling numbers | 3 h |
| Share of that the USL removes (joins, reconciliation and data checks move into the model) | 60% |
| One-off cost to build the model and rules | 2 days (16 h) |
| Upkeep when a source changes | 2 h a month |

Saving: 2 × 3 h × 60% = 3.6 h a week, about 15.6 h a month, minus 2 h upkeep ≈ **13.6 h a month**. The 16 h build cost is paid back in about five weeks. The 60% is the least certain number; at 30% the payback is about ten weeks.

## 2c. Killer requirement for Zetaris (PM view)

**Problem.** Zetaris can return wrong numbers without any error. On 2.4.3.1, reading the same JDBC table twice in one query (two CTEs, two subqueries, a self-join) returns the first read's rows for both (R1, R4 above). The numbers look plausible. WhyBot's first live run concluded "no change between weeks" because of it. Agents write that SQL shape naturally. Today the only defence is a lint in the client (`src/zetaris/lint.ts`) or knowing about the bug.

**Requirement.** *A USL model must be able to prove its numbers match its sources.*

1. **P0: fix repeated reads of JDBC tables.** A second scan of the same table with a different filter must not reuse the first scan's rows. Acceptance: R1 and R4 return the same values as R5.
2. **P1: reconciliation rules in DQ.** A new rule type, `REGISTER DQ … RECONCILE <aggregate> BY <key> WITH SOURCE (<query>) TOLERANCE <n>`, that compares a USL table's aggregate with an aggregate over the raw source, per group, and reports the groups that differ in `RUN DQ`, like any other rule. It would catch wrong results, activation drift and REST schema drift (a renamed JSON field becomes NULLs, which become a mismatch).
3. **P2: declare it in the DDL** (`… RECONCILES WITH app_pg.accounts COUNT BY …`) so the check travels with the model.

**Why it is the killer requirement.** A semantic layer is valuable only if people trust it more than their own spreadsheets. Silent wrong results remove that trust, and agents on top of a USL magnify the damage, because they act on numbers without looking at them.

**Mock (BONUS).** [`data/zetaris/mock_reconcile_rule.sql`](../data/zetaris/mock_reconcile_rule.sql) has the proposed syntax, in comments because Zetaris does not support it, and the query the rule would run, which does run today:

```sql
-- proposed (not supported in Zetaris 2.4.3.1)
REGISTER DQ accounts_match_backend
  TABLE lightning.metastore.whybot_usl.growth.funnel_daily
  RECONCILE sum(accounts_created) BY event_date
  WITH SOURCE (SELECT to_date(created_at) AS event_date, count(*) AS v FROM app_pg.accounts GROUP BY to_date(created_at))
  TOLERANCE 0;
```

What the rule would report, computed live with the equivalent query ([`mock_reconcile_run.md`](zetaris-usl-output/mock_reconcile_run.md)):

| days_checked | days_matching | days_mismatched | usl_accounts | source_accounts |
|---|---|---|---|---|
| 91 | 91 | 0 | 28102 | 28102 |

So `RUN DQ accounts_match_backend` would show total 91, valid 91, invalid 0 for the current model. If the bug or a source change made the USL disagree with the backend on any day, that day would appear as an invalid record instead of as a wrong number in a report.

## Limits and what was not verified

- All results come from one local Zetaris 2.4.3.1 instance on 27 October 2026. Run times include the REST round trip.
- `MATERIALIZE USL TABLE` and USL access controls were not used.
- `COMPILE USL` without `IF NOT EXISTS` redeployed cleanly on a second run, and the script re-activates every table afterwards. Whether an existing activation survives a recompile on its own was not checked; we always re-activate.
- The repeated-read result through the USL (R2, R3) covers four query shapes, not the general case.
- The time-savings forecast in 2b is an estimate from stated assumptions, not a measurement.
