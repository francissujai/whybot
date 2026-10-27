# How WhyBot uses the sponsor technology

WhyBot investigates why a metric moved: it lists competing explanations, tests each one with SQL, and writes a report in which every number cites its query. Three sponsor technologies do the work: **Zetaris** (data), **Meterless** (engines and runtime) and **NVIDIA Nemotron** (model). This page answers, for each one, how it is integrated and how we know it works.

---

## 1. How Zetaris was integrated

**Zetaris is the only way WhyBot reads data.** Every query the agent writes goes to the local Zetaris 2.4.3.1 install through its REST SQL endpoint (`POST /api/v1.0/sql-editor/sqls/run`), never to a database directly.

| Piece | File | What it does |
|---|---|---|
| Source registration | [`data/zetaris/whybot_create.sql`](../data/zetaris/whybot_create.sql) | Registers three sources: `ads_pg` and `app_pg` (two Postgres 16 databases over JDBC) and `holidays_rest`, a Zetaris REST table over the live canada-holidays.ca API, flattened with `LATERAL VIEW explode()` into the SchemaStore view `whybot.ca_holidays`. |
| SQL client | [`src/zetaris/client.ts`](../src/zetaris/client.ts) | Bearer-key REST client. A read-only guard refuses anything except a single `SELECT` / `WITH` / `SHOW` / `DESCRIBE` before it leaves the process. Converts Zetaris's all-string results into numbers (`normalise`). |
| Query lint | [`src/zetaris/lint.ts`](../src/zetaris/lint.ts) | Refuses SQL that would run but return wrong numbers on Zetaris (below) and tells the model how to rewrite it. |
| Catalogue for the model | [`src/agent/catalog.ts`](../src/agent/catalog.ts) | The Zetaris-qualified tables and Spark SQL rules the model writes against, so one query can join all three sources. |
| Evidence ledger | [`src/agent/evidence.ts`](../src/agent/evidence.ts) | Every Zetaris query and its rows become an exhibit (E1, E2, …) that the report cites. |
| Unified Semantic Layer | [`data/zetaris/usl_create.sql`](../data/zetaris/usl_create.sql), [ZETARIS_USL.md](ZETARIS_USL.md) | A five-table USL (`lightning.metastore.whybot_usl.growth`) over all three sources, with key checks and data-quality rules. Its `tracking_coverage_90` rule finds the six mobile days after release 4.12.0 on its own (182 records, 176 valid, 6 invalid). |

`npm run check` confirms Zetaris answers `SELECT 1` and counts the rows of every registered table. The recorded runs in [`samples/`](../samples/) contain the actual SQL and rows in `evidence.json` (for example, 9 queries in `samples/2026-10-24T02-21-21`).

## 2. Which Meterless engines were implemented, what they do, and the tests

WhyBot has its own TypeScript implementations of two Meterless engines, written from the specs in meterless/meterless `engines/*/AGENTS.md`. Both run in the main flow of every investigation.

### Markovian (`src/engines/markovian/`)

**What it does.** It runs the investigation in bounded chunks. Each chunk tests one hypothesis. At the end of a chunk, only a compact state (completed verdicts with evidence ids, remaining hypotheses) carries over to the next one, through the carryover cascade: markers, then the LLM compressor, then a heuristic, then truncation. The prompt therefore does not grow with the number of hypotheses tested. In the recorded run `samples/2026-10-24T02-21-21`, prompt tokens per step were 19,907, 8,409, 17,682 and 17,061 over four steps. It also records each run's chunk configuration and token efficiency, labelled *measured* when Nightshift reports usage.

**Where it is used.** [`src/agent/investigator.ts`](../src/agent/investigator.ts) drives `Markovian.run` in RESEARCH mode with the Zetaris SQL tool.

### H-MEM (`src/engines/hmem/`)

**What it does.** Memory across investigations. After a completed run, each verdict is stored with provenance (`<run>#E3`). Before the next run, related findings are recalled with hybrid ranking and injected into chunk 1 only. A new finding that contradicts an old one goes through conflict scan, auto-resolve (0.70 gate) and the supersede policy, so the old record is marked `supersededBy` and nothing is deleted. Feedback (`npm run memory -- feedback <id> wrong`), sleep and human-approved dreaming are also available.

**Where it is used.** [`src/agent/memory.ts`](../src/agent/memory.ts) (`recall`, `learn`, `resolveConflicts`), called from [`src/agent/session.ts`](../src/agent/session.ts).

### Tests

**Official conformance** (`npm run conformance`, runners copied unchanged from meterless/meterless@1742dec into [`conformance/`](../conformance/), scorecards in `conformance/results/`):

- **Markovian 8/8:** `eff-001` efficiency model reproduces the worked example; `snap-001`/`snap-002` chunkConfig snapshot and historical efficiency; `ovl-001` overlap contract; `lab-001` estimated/measured labels; `ref-001` reflection failure does not fail the run; `mrk-001` markers cleaned and drive completion; `cfg-001` config bounds raise typed errors.
- **H-MEM 13/13:** `rv-001`/`rv-002` provenance required; `fd-001`…`fd-005` exact feedback deltas and clamping; `ro-001`/`ro-002` ranking (superseded penalty, confidence); `sg-001` sleep guardrail; `cg-001` auto-resolve supersedes and deletes nothing; `la-001` ledger audit; `db-001` dream proposals need approval.

**WhyBot's own tests** (`npm test`, offline, with a scripted model and fake SQL):

- [`test/investigator.test.ts`](../test/investigator.test.ts) (Markovian in WhyBot's loop):
  - "investigation runs as bounded chunks, ledger records each query, context stays flat": chunk 3's prompt contains the carryover state but not the earlier transcript.
  - "query budget per chunk is enforced and the chunk is forced to checkpoint"
  - "premature [TASK_COMPLETE] is refused and turned into a checkpoint"
  - "a quoted [TASK_COMPLETE] or a planned verdict does not end the investigation"
  - "the first step must run a query before it can checkpoint"
  - "lint rejects repeated table reads and timestamp-vs-date bounds"
  - "SQL guard refuses writes and multiple statements"
  - "citation check flags unknown ids, failed queries and uncited numbers"
- [`test/memory.test.ts`](../test/memory.test.ts) (H-MEM in WhyBot's loop):
  - "findings are parsed per hypothesis with their evidence ids and verdicts"
  - "learned findings persist, are recalled for a related question, and enter chunk 1 only"
  - "a contradicting new finding supersedes the old one without deleting it"

## 3. How the app connects to Meterless Nightshift

**Nightshift is WhyBot's primary and only model provider.** There is no other model client in the code, and `MODEL_PROVIDER=meterless` is the only supported setting. [`src/llm/meterless.ts`](../src/llm/meterless.ts) implements the Meterless "add Meterless as a provider" contract against Nightshift's OpenAI-compatible endpoint on `127.0.0.1:8088`:

- `Authorization: Bearer <runtime token>` from the Nightshift Console (`MODEL_API_KEY` in `.env`); the `rt-local` placeholder is rejected.
- `meterless-app` on every call and `meterless-scope: user` on chat requests.
- Base URL auto-detection on 8088, 8090, 8787 and 11434; 180 s timeout (configurable); retries after 2, 4 and 8 s on 429.
- Status from `GET /v1/models` (401/403 means unauthorized), shown by `npm run check` as the "Power" lines.
- WhyBot asks for a routing mode (`NEMOTRON_MODEL`, for example `meterless/deep`), not a specific model, and Nightshift picks the lane.
- **Compute receipts.** Each response's receipt (receipt id, routed model, lane label, provider, cloud or local, tokens) is kept per call (`ReceiptLog`), streamed to the UI, saved to `receipts.json`, and summarised in every report under "Model calls (Nightshift compute receipts)".

## 4. Where NVIDIA technology contributes

All of WhyBot's reasoning runs on **NVIDIA Nemotron** through Nightshift: listing hypotheses, writing the SQL, judging each verdict, compressing state between Markovian steps, and writing the cited report. The receipts in the recorded runs show which Nemotron lanes answered:

| Recorded run | Nemotron 3.5 Super VL 120B A12B | Nemotron 3.5 Lightning 30B A3B |
|---|---|---|
| `samples/2026-10-24T02-21-21` | 9 investigation calls + the report | none |
| `samples/2026-10-23T18-19-23` | 12 investigation calls | 4 investigation calls + the report |
| `samples/2026-10-23T00-40-09` | 5 investigation calls | 2 investigation calls + the report |

These calls were served by NVIDIA's API lanes configured in Nightshift (receipt `kind: cloud`). The NVIDIA key lives only inside Nightshift, never in WhyBot's code or `.env`. Nightshift can also serve a local Nemotron lane on an NVIDIA GPU without any change to WhyBot; the recorded samples do not include a local-lane run.

## 5. What was unique

- **We found a silent wrong-results bug in Zetaris and built a defence against it.** On 2.4.3.1, a query that reads the same JDBC table twice (two CTEs, two subqueries or a self-join) returns the first read's rows for both reads. An agent writing natural week-over-week SQL concludes "no change". WhyBot's first live run did exactly that. [`src/zetaris/lint.ts`](../src/zetaris/lint.ts) now refuses such queries before they reach Zetaris and tells the model to use a single pass with `SUM(CASE …)`. Write-up: [ZETARIS_FINDINGS.md](ZETARIS_FINDINGS.md). We also checked the USL: the same query shapes over USL tables returned correct results in every shape we tried ([ZETARIS_USL.md](ZETARIS_USL.md)).
- **Compute receipts per call, as evidence.** Each report says which Nemotron lane answered each call, with token counts, next to the SQL evidence. You can audit both the data and the model.
- **H-MEM conflict handling that never deletes.** When a new investigation contradicts an old belief, the old record is superseded, with lineage, and stays inspectable.
- **Flat prompt size with Markovian.** Each step starts from the compact state rather than the transcript, so a nine-step investigation (`samples/2026-10-23T18-19-23`) does not carry a nine-step context.
- **A data-quality rule that explains the metric.** In the USL, `tracking_coverage_90` (`tracked_signups >= 0.9 * accounts_created`) isolates the measurement half of the drop with no agent involved.
- **Citation checking.** The report is checked against the evidence ledger: unknown evidence ids, citations of failed queries, and sentences with uncited numbers are flagged.
