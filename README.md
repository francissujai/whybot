# WhyBot: "Why did our numbers move?"

WhyBot is an agent that investigates a metric change across your data sources and explains **why** it happened. Every claim in its answer links to the SQL and rows behind it.

Open Agent Hackathon 2026 · Track 02, *The Agent That Can Explain Why*.

**Data:** Zetaris federates three sources (two Postgres databases and a live REST API) · **Engines:** Meterless Markovian + H-MEM, both passing the official conformance suites · **Model:** NVIDIA Nemotron through Meterless Nightshift, which runs on this machine.

Sponsor technology in detail: [docs/SPONSOR_TECH.md](docs/SPONSOR_TECH.md) · Zetaris Unified Semantic Layer: [docs/ZETARIS_USL.md](docs/ZETARIS_USL.md) · Try it with no services running: [Sample mode](#sample-mode-no-zetaris-or-nightshift-needed)

---

## The problem

A marketing lead opens the dashboard on Monday and sees trial signups down **18%** week over week. Answering why usually takes an analyst a day: pulling ad-platform exports, release notes, the analytics events table, the backend database and a holiday calendar, then arguing about which cause is real.

WhyBot does that investigation in minutes and shows its work.

## What WhyBot finds in the demo data

The question is "Why did trial signups drop 18% last week?". WhyBot:

1. **Confirms the move.** Tracked signups fell from 2,160 to 1,771 (−18.0%).
2. **Lists competing hypotheses** across every source: an ad change, a release or tracking break, a pricing change, a holiday, and real demand.
3. **Tests one hypothesis per step** with SQL through Zetaris, giving each a verdict:
   - **Measurement, not business:** release `4.12.0` (13 Oct, 15:40) shipped a new mobile signup stepper. After it, the mobile `trial_signup` analytics event stops firing for about a third of signups. Form submits and backend accounts stay flat, so **about half the "drop" is not real**.
   - **Real loss:** on 13 Oct the *Brand Search – North America* daily budget was cut from $1,200 to $500, and brand clicks and accounts fell with it.
   - **Ruled out:** Thanksgiving (Mon 12 Oct, read from the live canada-holidays.ca API) caused a one-day dip only. Pricing hasn't changed since 1 June. The social creative swap on 14 Oct had no measurable effect.
4. **Writes a report** with a decomposition table and owners for each action. A citation checker flags any number that lacks evidence.

The dataset is synthetic but realistic. It is generated deterministically by `scripts/generate-data.ts` (`npm run data:generate`) with the causes planted, so the right answer is known and the agent can be scored against it.

## How it works

```
question ──► H-MEM recall ──► Markovian investigation (bounded steps) ──► report + citation check ──► H-MEM learn
                 │                    │  each step: Nemotron writes <sql>,                │
                 │                    │  WhyBot runs it read-only through Zetaris,         │
                 │                    │  the result is stored in the evidence ledger (E#), │
                 │                    │  and only a compact state carries to the next step │
                 ▼                    ▼                                                    ▼
      past findings, chunk 1   Zetaris: ads_pg + app_pg (JDBC) + holidays_rest (REST)    runs/<ts>/report.html
```

| Layer | What WhyBot uses |
|---|---|
| **Data: Zetaris** | One SQL endpoint over three sources that can be joined in a single query: `ads_pg` (ad platform), `app_pg` (product analytics and backend accounts), and `holidays_rest` (the live canada-holidays.ca REST API via a Zetaris REST table). See `data/zetaris/whybot_create.sql`. |
| **Engines: Meterless** | **Markovian** runs the investigation in bounded steps, so the prompt stays flat however many hypotheses are tested. **H-MEM** remembers verdicts across sessions, with provenance, feedback, sleep and conflict handling. |
| **Power: Nightshift → Nemotron** | The only model provider. It is OpenAI-compatible on `127.0.0.1:8088`, follows the Meterless provider contract, and routes to the Nemotron lanes set up in Nightshift. |

### Meterless engine usage (command → engine service → spec)

| WhyBot command / feature | Engine | Service it uses | Spec section (`engines/*/AGENTS.md`) | Evidence |
|---|---|---|---|---|
| `npm run why` investigation loop | Markovian | `Markovian.run` (chunk orchestration, RESEARCH mode) | §4.5 orchestrator, §4.4 prompt builder | `runs/<ts>/run.json` (chunks, carryover per step) |
| One hypothesis per step, state between steps | Markovian | carryover cascade: marker → LLM `compressorFn` → heuristic → truncation | §4.3 carryover | `test/investigator.test.ts` checks step 3's prompt has the state but not the transcript |
| Token accounting in the report | Markovian | `runEfficiency` against the run's own snapshot; labeled **measured** when Nightshift reports usage | §6, §14 | "Context per step" chart in `report.html` |
| Recall past findings before investigating | H-MEM | `query` hybrid ranking → domain-grouped reinjection into chunk 1 only | §6 retrieval, §6.2 reinjection | "Recalled" table in `report.html` |
| Store verdicts after investigating | H-MEM | `add` with provenance (`run#E3` refs), layers by verdict | §2 records, §9 ledger | `.whybot/memory/state.json`, `ledger.jsonl` |
| New evidence contradicts an old belief | H-MEM | `conflicts.scan` → `autoResolve` (0.70 gate) → `supersede` policy, nothing deleted | §10 | `test/memory.test.ts` |
| `npm run memory -- feedback <id> wrong` | H-MEM | exact feedback deltas (+0.05 / −0.03 / −0.20 + review tag) | §9.2 | ledger entries |
| `npm run memory -- sleep` / `dream` / `approve` | H-MEM | preview-first sleep with guardrails; dreaming needs human approval | §7, §8 | CLI output |

**Conformance:** both engines are WhyBot's own implementations, tested by the official Meterless runners, which are copied unchanged into `conformance/`:

```
npm run conformance     # Markovian 8/8, H-MEM 13/13; scorecards saved to conformance/results/
```

## Sample mode (no Zetaris or Nightshift needed)

Three real investigations are committed under [`samples/`](samples/), each with its report, evidence (every SQL statement and its rows), the Markovian run record and the Nightshift compute receipts:

| Sample | Question | Includes |
|---|---|---|
| `samples/2026-10-24T02-21-21` | Why did trial signups drop 18% last week? | report, evidence, run record, receipts, **events.jsonl (replayable)** |
| `samples/2026-10-23T18-19-23` | Why did mobile trial signups fall last week? | report, evidence, run record, receipts |
| `samples/2026-10-23T00-40-09` | Why did trial signups drop 18% last week? (earlier run, different lanes) | report, evidence, run record, receipts |

When `runs/` does not contain a run, the server falls back to `samples/`, so a fresh clone can browse them with nothing else running:

```powershell
npm install
npm run web:install
npm run web:build
npm run serve            # http://127.0.0.1:4173
```

Open **/app → Archive**. Sample runs are marked "Sample run" in the list, "(sample)" in Ctrl K search, and `"sample": true` in `GET /api/status` and `GET /api/runs`. **Report** opens the saved report; **Replay** plays `2026-10-24T02-21-21` back with its original timing. Asking a new question still needs Zetaris and Nightshift. A run in `runs/` with the same id takes priority over a sample. The recorded files are unchanged except that the absolute `reportPath` in the replay's last event was replaced with a repo-relative path, and the two older runs got a `question.txt` copied from their report heading.

## Run it

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 20+ (tested on 24.12) with npm 10+ | everything |
| Docker Desktop | current, with WSL 2 on Windows | the demo Postgres (`npm run data:up`) and Zetaris |
| Zetaris | local Docker bundle (2.4.3.1) from Zetaris Cloud, "Run locally" page | running an investigation |
| Python | 3 (setup installs 3.13; standard library only) | `scripts/run_sql.py` from zetaris-getting-started, to register the sources |
| zetaris-getting-started | [github.com/zetaris/getting-started](https://github.com/zetaris/getting-started), cloned into `zetaris-getting-started/` by `setup/02-zetaris-wsl.sh` (gitignored) | `run_sql.py` and the Zetaris SQL guides |
| Meterless Nightshift | with at least one Nemotron lane | running an investigation |

[docs/SETUP.md](docs/SETUP.md) walks through the machine setup step by step (`setup/01-install-windows.ps1` installs Git, Python, Node and Docker Desktop; `setup/02-zetaris-wsl.sh` installs Zetaris in WSL and clones zetaris-getting-started). Without Zetaris and Nightshift, the web UI still loads and shows the [sample runs](#sample-mode-no-zetaris-or-nightshift-needed), and `npm test`, `npm run typecheck`, `npm run conformance` and `npm run web:build` all run.

### Setup

```powershell
npm install
npm run web:install                     # the UI's packages (web/)

# Demo data. The seed SQL is committed; regenerate it only if you change the generator:
npm run data:generate                   # optional: rewrites data/seed/*.sql (deterministic, seed 42)
npm run data:up                         # Postgres 16 with adsdb + appdb as container whybot-pg

# Register the three sources in Zetaris (needs ZETARIS_API_KEY in zetaris-getting-started/.env.local)
cd zetaris-getting-started
python scripts/run_sql.py ../data/zetaris/whybot_create.sql --dry-run
python scripts/run_sql.py ../data/zetaris/whybot_create.sql
cd ..

copy .env.example .env                  # then fill in ZETARIS_API_KEY, MODEL_API_KEY (Nightshift Console)
npm run check                           # Power and Data checks: every line should PASS
```

`npm run data:up` joins the container to the Docker network `zetaris_default`, which the Zetaris bundle creates. **Start Zetaris first**; if the network does not exist yet, Compose refuses to start the container. Zetaris reaches the database as `whybot-pg:5432`; your machine reaches it on `127.0.0.1:55432`.

The demo Postgres password (`whybot_local_dev`, in `data/docker-compose.yml`, `data/zetaris/whybot_create.sql` and `.env.example`) is a **local-only default** for synthetic data. The port is bound to 127.0.0.1. Set `WHYBOT_PG_PASSWORD` and change `whybot_create.sql` to match if you want a different one.

Optional, for the Zetaris Unified Semantic Layer: `npm run zetaris:usl` builds the `lightning.metastore.whybot_usl.growth` model, its data-quality rules and three queries through it. See [docs/ZETARIS_USL.md](docs/ZETARIS_USL.md).

### Run

```powershell
npm run dev                             # data:up + build the UI + serve on http://127.0.0.1:4173
```

- **`/`** is the landing page. **Open the app** goes to **`/app`**.
- **`/app`**: ask a question and watch the case build. Hypotheses move from "Evidence gathered" to Confirmed, Measurement or Ruled out as the queries come back, and the finding cites each query by id. Zetaris and Nightshift must be running.
- **Archive** (`/app#archive`) lists past runs and the sample runs, each with **Report** (the saved `report.html`) and, when events were saved, **Replay**.
- **Replay** (`/replay/<run-id>`) plays a run back with its original timing, a scrubber and 1x / 4x / 10x speed.
- **Ctrl K** opens search; **Auto / Light / Dark** switches the theme.

To start only the web server: `npm run serve`. It serves the UI built into `web/dist`; if that folder is missing it falls back to the original single-page UI in `src/ui/page.ts`. After changing files in `web/src`, run `npm run web:build`, or `npm --prefix web run dev` for hot reload on :5173 (it proxies the API to :4173). The server binds to 127.0.0.1 and runs one investigation at a time.

From the command line instead:

```powershell
npm run why -- "Why did trial signups drop 18% last week?"
```

Each run writes `runs/<timestamp>/` containing `report.html` (open it in a browser), `report.md`, `evidence.json` (every SQL statement and its rows), `run.json` (the Markovian run record), `receipts.json` (the Nightshift compute receipt for each model call) and `events.jsonl` (for Replay).

Run a related question afterwards to watch H-MEM at work. The first step starts from what WhyBot already learned:

```powershell
npm run why -- "Why did mobile trial signups fall last week?"
npm run memory -- list
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | `data:up`, `web:build`, then `serve` |
| `npm run serve` | web UI and API on 127.0.0.1:4173 |
| `npm run why -- "<question>"` | one investigation from the command line |
| `npm run check` | Nightshift (Power) and Zetaris (Data) checks |
| `npm run memory -- <list, feedback, sleep, dream, approve, conflicts>` | H-MEM memory tools, for example `feedback <id> wrong` or `sleep --apply` |
| `npm run data:generate` | regenerate `data/seed/*.sql` from `scripts/generate-data.ts` |
| `npm run data:up` / `data:down` | start / stop the demo Postgres (needs the `zetaris_default` network) |
| `npm run zetaris:usl` | build and query the Zetaris USL (`data/zetaris/usl_*.sql`) |
| `npm run zetaris:compare` | hand-coded equivalent of the USL queries, for comparison |
| `npm run demo:facts` | the investigation's key facts straight from Zetaris, no model involved |
| `npm test`, `npm run typecheck`, `npm run conformance`, `npm run web:build` | tests and builds (see below) |

## Safety and trust

- **Read-only.** The SQL tool refuses anything except a single `SELECT` / `WITH` / `SHOW` / `DESCRIBE` before it leaves the process (`src/zetaris/client.ts`).
- **Known Zetaris pitfalls blocked.** `src/zetaris/lint.ts` refuses queries that read the same table twice, which return wrong numbers on Zetaris 2.4.3.1 ([docs/ZETARIS_FINDINGS.md](docs/ZETARIS_FINDINGS.md)).
- **Every number is checked.** The report's citation check flags evidence ids that don't exist, citations of failed queries, and sentences that state a number without citing evidence.
- **Local-first, with two kinds of outside call.** Zetaris, the databases, the engines, Nightshift and the web server all run on this machine. Calls leave it in two cases: Zetaris reads the public holidays API (canada-holidays.ca), and Nightshift sends model calls to NVIDIA's API when it uses a cloud Nemotron lane (the recorded sample runs did). With a local Nemotron lane in Nightshift, the holidays API is the only outside call.
- **Secrets stay out of git.** The Zetaris key and Nightshift token live in `.env`, which is gitignored. The NVIDIA key lives only in Nightshift.

## Project layout

```
src/
  cli.ts                     npm run why | check | memory
  server.ts, ui/page.ts      npm run serve: API and web server (127.0.0.1:4173); ui/page.ts is the fallback page
  agent/session.ts           one investigation end to end, shared by CLI and UI
  agent/runs.ts              saved runs: runs/ first, then samples/ (sample mode)
  agent/investigator.ts      Markovian-powered investigation loop with the SQL tool
  agent/evidence.ts          evidence ledger (E1, E2, ...)
  agent/report.ts            report writer, citation check, HTML render
  agent/memory.ts            H-MEM recall / learn / conflict policy
  agent/catalog.ts           what the model knows about the data
  engines/markovian/         Markovian engine (passes the 8/8 conformance suite)
  engines/hmem/              H-MEM engine (passes the 13/13 conformance suite)
  llm/meterless.ts           Meterless Runtime provider (Nightshift → Nemotron), compute receipts
  zetaris/client.ts          Zetaris REST SQL client with a read-only guard
  zetaris/lint.ts            refuses SQL shapes that return wrong numbers on Zetaris
web/                         the UI: React + Vite + motion (see DESIGN.md), built to web/dist
  src/landing/               landing page (/) and the scroll film
  src/views/                 Home (/app), Archive, Replay
samples/                     three recorded runs for sample mode
scripts/
  generate-data.ts           deterministic demo data with planted causes (npm run data:generate)
  conformance.ts             runs both official conformance suites
  zetaris-usl.ts             runs Zetaris SQL files (npm run zetaris:usl)
  handcoded-compare.ts       the USL queries hand-coded against Postgres + the API (npm run zetaris:compare)
  demo-facts.ts              key facts straight from Zetaris (npm run demo:facts)
data/
  docker-compose.yml         Postgres container on the zetaris_default network
  seed/                      generated seed SQL for adsdb and appdb
  zetaris/                   source registration, exploratory queries, USL model, DQ rules and queries
conformance/                 official Meterless runners (Apache-2.0, see conformance/NOTICE)
setup/                       Windows and WSL setup scripts
test/                        offline tests (scripted model, fake SQL)
smoke/                       HTTP smoke tests against a running server
docs/                        SETUP, SPONSOR_TECH, ZETARIS_USL, ZETARIS_FINDINGS, OVERVIEW, demo and video scripts
```

## Tests

```
npm test            # offline: investigation loop, SQL guard, lint, citations, memory, case model, sample mode, USL runner
npm run typecheck
npm run conformance # Markovian 8/8, H-MEM 13/13
npm run web:build   # type-check and build the UI (web/)
npm run smoke       # HTTP smoke tests against a running server (start npm run serve first)
```

## Pre-existing components

WhyBot was built for the hackathon. These parts existed before and are used, not written, by us:

| Component | Where it comes from | How WhyBot uses it |
|---|---|---|
| Meterless conformance runners and test vectors | [meterless/meterless](https://github.com/meterless/meterless) @ `1742dec`, Apache-2.0 | copied unchanged into `conformance/` (see `conformance/NOTICE`); they test our engines |
| Meterless engine specs | meterless/meterless `engines/markovian/AGENTS.md`, `engines/hmem/AGENTS.md` | `src/engines/` is our own implementation of these specs |
| Meterless provider contract | Meterless docs, "Add Meterless as a provider" | implemented in `src/llm/meterless.ts` |
| Meterless Nightshift | meterless.ai desktop app | the model runtime (not in the repo) |
| NVIDIA Nemotron 3.5 models | NVIDIA, served through Nightshift | all model calls (not in the repo) |
| Zetaris local platform bundle 2.4.3.1 | Zetaris Cloud "Run locally" | the federated SQL engine (not in the repo) |
| zetaris/getting-started | [github.com/zetaris/getting-started](https://github.com/zetaris/getting-started), Apache-2.0 | `scripts/run_sql.py` and its SQL guides, used from a local clone; not committed |
| canada-holidays.ca API | public REST API | real holiday data through Zetaris |
| `postgres:16-alpine` | Docker Hub | the demo databases |
| npm packages | see `package.json` and `web/package.json` (TypeScript, tsx, pg; React, Vite, motion, three, @react-three/fiber, lenis for the UI) | build, runtime and UI |

Everything else (the agent, both engine implementations, the evidence ledger, citation check, lint, memory policy, web UI, demo data generator and Zetaris USL model) was written for WhyBot.

## Licence

MIT, see [LICENSE](LICENSE). The files in `conformance/` copied from Meterless are Apache-2.0 ([conformance/LICENSE](conformance/LICENSE), [conformance/NOTICE](conformance/NOTICE)).
