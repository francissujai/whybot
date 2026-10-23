# WhyBot: "Why did our numbers move?"

WhyBot is an agent that investigates a metric change across your data sources and explains **why** it happened. Every claim in its answer links to the SQL and rows behind it.

Open Agent Hackathon 2026 · Track 02, *The Agent That Can Explain Why*.

**Data:** Zetaris federates three sources (two Postgres databases and a live REST API) · **Engines:** Meterless Markovian + H-MEM, both passing the official conformance suites · **Model:** NVIDIA Nemotron through Meterless Nightshift, running on this machine.

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

The dataset is synthetic but realistic. It is generated deterministically by `scripts/generate-data.ts` with the causes planted, so the right answer is known and the agent can be scored against it.

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

## Run it

Prerequisites: the machine setup in [docs/SETUP.md](docs/SETUP.md), meaning Docker Desktop, Zetaris running locally, Meterless Nightshift with Nemotron lanes, and Node 20+.

```powershell
npm install
npm run data:up                         # Postgres with adsdb + appdb, on the Zetaris Docker network

# Register the three sources in Zetaris (needs ZETARIS_API_KEY in zetaris-getting-started/.env.local)
cd zetaris-getting-started
python scripts/run_sql.py ../data/zetaris/whybot_create.sql --dry-run
python scripts/run_sql.py ../data/zetaris/whybot_create.sql
cd ..

copy .env.example .env                  # then fill in ZETARIS_API_KEY, MODEL_API_KEY (Nightshift Console)
npm run check                           # Power and Data checks: every line should PASS
npm run why -- "Why did trial signups drop 18% last week?"
```

Or use the web UI: `npm run serve` and open http://127.0.0.1:4173 to ask a question, watch each step stream in, and open the report.

Each run writes `runs/<timestamp>/` containing `report.html` (open it in a browser), `report.md`, `evidence.json` (every SQL statement and its rows) and `run.json` (the Markovian run record).

Run a related question afterwards to watch H-MEM at work. The first step starts from what WhyBot already learned:

```powershell
npm run why -- "Why did mobile trial signups fall last week?"
npm run memory -- list
```

## Safety and trust

- **Read-only.** The SQL tool refuses anything except a single `SELECT` / `WITH` / `SHOW` / `DESCRIBE` before it leaves the process (`src/zetaris/client.ts`).
- **Every number is checked.** The report's citation check flags evidence ids that don't exist, citations of failed queries, and sentences that state a number without citing evidence.
- **Local-first.** Data, engines and model all run on this machine. The only outside call is the public-holidays API, made by Zetaris.
- **Secrets stay out of git.** The Zetaris key and Nightshift token live in `.env`, which is gitignored. The NVIDIA key lives only in Nightshift.

## Project layout

```
src/
  cli.ts                     npm run why | check | memory
  server.ts, ui/page.ts      npm run serve: web UI with live progress (127.0.0.1:4173)
  agent/session.ts           one investigation end to end, shared by CLI and UI
  agent/investigator.ts      Markovian-powered investigation loop with the SQL tool
  agent/evidence.ts          evidence ledger (E1, E2, ...)
  agent/report.ts            report writer, citation check, HTML render
  agent/memory.ts            H-MEM recall / learn / conflict policy
  agent/catalog.ts           what the model knows about the data
  engines/markovian/         Markovian engine (passes the 8/8 conformance suite)
  engines/hmem/              H-MEM engine (passes the 13/13 conformance suite)
  llm/meterless.ts           Meterless Runtime provider (Nightshift → Nemotron)
  zetaris/client.ts          Zetaris REST SQL client with a read-only guard
scripts/generate-data.ts     deterministic demo data with planted causes
scripts/conformance.ts       runs both official conformance suites
data/                        Postgres container, seed SQL, Zetaris registration SQL
conformance/                 official Meterless runners (Apache-2.0)
test/                        offline tests (scripted model, fake SQL)
docs/SETUP.md                machine setup checklist
```

## Tests

```
npm test            # offline: investigation loop, SQL guard, citations, memory
npm run typecheck
npm run conformance
```
