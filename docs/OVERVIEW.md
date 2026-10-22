# WhyBot: project overview for the team

A primer on the hackathon, the track, what we're building, and how each sponsor's technology fits in.

---

## 1. The hackathon

- **Event:** Open Agent Hackathon 2026, run online by GenAI Works. Event page: hackathon.genai.works.
- **Theme:** AI agents that reason over real data.
- **Key dates:**
  - registration closed Oct 22
  - **submission is due Oct 27, 23:45 UTC (hard deadline)**
  - results on Nov 6
- **Prizes:** up to $20k. Each track pays $1,600 / $1,200 / $900 for 1st / 2nd / 3rd. Separately, an **NVIDIA DGX Spark** goes to the best use of NVIDIA Nemotron.
- **Judging (100 points):**

  | Criterion | Points |
  |---|---|
  | Impact | 30 |
  | Technical | 20 |
  | Innovation | 15 |
  | Demo | 15 |
  | Product & UX | 10 |
  | Sponsor tech | 10 |

- **What we submit:** a 1–4 minute demo video, a deck, the repo with its README, and an integration write-up covering Zetaris, Meterless and NVIDIA.

## 2. Our track: Track 02, "The Agent That Can Explain Why"

- **The brief:** agents that investigate complex questions across **multiple data sources**, connect the findings, and give **evidence-backed** answers.
- **What "explain why" means in practice:**
  - Don't just report that a number changed; find the **cause**.
  - Weigh **competing explanations** and rule some out.
  - Show the **evidence** so a human can check it.
- **Other tracks, for context:**
  - 01: fragmented data
  - 03: reasoning architecture
  - Wildcard: extend an existing project

## 3. The problem we chose

- On Monday morning, a marketing lead sees **trial signups down 18%** week over week.
- Finding out why usually takes an analyst a day: ad-platform exports, release notes, the analytics events, the backend database, a holiday calendar.
- Often the "drop" isn't even real. A tracking bug or a reporting change can look exactly like lost customers.
- Teams act on the wrong explanation: they cut budgets, blame the market, or chase a holiday.

## 4. What we're building: WhyBot

> Ask "Why did trial signups drop 18% last week?" and get a short answer with a breakdown of causes, where every number links to the SQL and rows behind it.

**How it investigates** (like a good analyst):
1. **Confirm the move.** Is the drop real, and how big is it?
2. **List competing hypotheses:** an ad change, a release or tracking break, pricing, a holiday, real demand.
3. **Test one hypothesis at a time** with SQL across the sources, giving each a verdict: supported, ruled out, or inconclusive.
4. **Separate measurement from reality.** Compare the dashboard against the backend source of truth.
5. **Quantify** how much of the change each cause explains.
6. **Write the report.** Every claim cites its evidence (`[E3]` links to the exact query and result), and a checker flags any number without a source.
7. **Remember** what it learned, so the next related question starts from those findings.

**The demo story** (synthetic data with planted causes, so we know the right answer):

| Finding | Type | Verdict |
|---|---|---|
| Release 4.12.0 broke mobile signup tracking (Oct 13) | Measurement: about half the "drop" isn't real | Supported |
| Brand Search budget cut from $1,200 to $500 (Oct 13) | Real lost signups | Supported |
| Thanksgiving (Oct 12) | One-day dip only | Ruled out |
| Pricing change | No change since June | Ruled out |
| Social ad creative swap | No measurable effect | Ruled out |

**Why this scores well:**
- **Impact:** a real, daily, expensive problem with a clear user.
- **Technical:** a federated multi-source investigation, bounded reasoning, persistent memory, and guardrails.
- **Demo:** a crisp before-and-after story with a surprise twist (half the drop is fake).

## 5. How the sponsor tools fit

```
  Question
     │
     ▼
  ┌──────────────── WhyBot (our TypeScript agent) ─────────────────┐
  │  H-MEM ──► recalls past findings                               │
  │  Markovian ──► runs the investigation as small, bounded steps  │
  │  Evidence ledger ──► every query gets an id [E1], [E2] …       │
  └──────┬───────────────────────────────────────────┬─────────────┘
         │ SQL (read-only)                           │ prompts
         ▼                                           ▼
  ┌──────────────┐                         ┌───────────────────────┐
  │   ZETARIS    │                         │ METERLESS NIGHTSHIFT  │
  │  one SQL     │                         │  local model runtime  │
  │  endpoint    │                         │          │            │
  └──┬────┬────┬─┘                         │          ▼            │
     │    │    │                           │   NVIDIA NEMOTRON     │
  ads_pg app_pg holidays (REST)            └───────────────────────┘
```

### Zetaris: the data layer
- **What it is:** a federated SQL engine. One endpoint queries databases, files and APIs **without copying the data**.
- **How we use it:**
  - Two Postgres databases (the ad platform, and the product plus backend) and a **live public REST API** of holidays.
  - All three are joinable in **one SQL query**.
  - It runs locally in Docker.
- **Why it matters for the track:** "across multiple data sources" is the core of Track 02, and Zetaris makes that one interface for the agent.
- **Rule:** Zetaris must run on our machine, and it can't read laptop files directly. Data has to live in a database or URL it can reach.
- **Our contribution back:** we found and documented a bug where a query reading the same table twice returns wrong rows (`docs/ZETARIS_FINDINGS.md`). WhyBot blocks those queries automatically.

### Meterless: the engines and the runtime
Meterless provides two separate things.

**a) Engines:** open specs (Apache-2.0) that we **implement ourselves**. Each has an official conformance test suite.

| Engine | What it does | What it does for WhyBot | Our score |
|---|---|---|---|
| **Markovian** | Runs long tasks in bounded "chunks"; only a compact state carries forward, so context stays flat | One hypothesis per step, so the prompt doesn't balloon as the investigation grows | 8/8 |
| **H-MEM** | Long-term memory with tiers, provenance, feedback, conflict handling and a "sleep" cleanup cycle | Remembers verdicts across sessions (with which run and evidence they came from), and supersedes old beliefs when new evidence contradicts them | 13/13 |
| World Model | Shared, event-sourced state for multiple agents | Not used | n/a |
| Scout Intent | Intent detection and prompt-injection guard | Not used yet (possible stretch goal) | n/a |

- **Rule:** at least one engine must power a **working feature**. Mentioning it or adding an unused dependency doesn't count. We use two, both in the main flow.

**b) Nightshift:** a desktop app that runs an OpenAI-compatible model endpoint on our machine (`127.0.0.1:8088`).
- **Rule:** it must be our **primary (and here, only) AI provider**.
- We request a *routing mode* (for example `meterless/local`) rather than a specific model, and Nightshift picks the lane.
- Every response includes a **compute receipt** showing which model actually answered. WhyBot logs these as evidence.

### NVIDIA Nemotron: the model
- **What it is:** NVIDIA's open model family, built for agents and reasoning.
- **How we use it:** all WhyBot reasoning (hypotheses, SQL, verdicts, the report) runs on Nemotron via Nightshift.
- **The setup decision:**
  - We first used NVIDIA's free cloud API (Nemotron 3.5 Super 120B and Lightning 30B). It was too slow through Nightshift: about 45 seconds per call, often timing out.
  - We're moving to **Nemotron 3.5 Lightning 30B running locally** on our RTX 5070 Ti. It's faster and fully local, and the NVIDIA prize story stays intact.
- **Prize angle:** the DGX Spark award needs Nemotron to *visibly* power a real feature. The receipts in every report prove it.
- **Rule:** the NVIDIA API key lives **only** inside Nightshift, never in our code or `.env`.

### Cursor (optional)
- The organizers made Cursor optional; any AI coding tool is allowed.

## 6. What makes WhyBot trustworthy (talking points for the demo)
- **Read-only:** the agent can't change any data.
- **Evidence for every number,** plus a citation checker that flags unsupported claims.
- **SQL lint** stops queries known to return wrong results.
- **No premature conclusions:** the agent can't finish until every hypothesis has a verdict.
- **Measured, not guessed:** real token counts and model receipts from Nightshift.
- **Local-first:** data, engines and model all run on our machine.

## 7. Glossary
- **Federation:** querying many sources through one SQL layer without moving the data.
- **Hypothesis / verdict:** a candidate cause, and the conclusion reached after testing it with data.
- **Evidence ledger:** WhyBot's record of every query and result, cited as `[E#]`.
- **Chunk / carryover (Markovian):** one bounded reasoning step, and the compact state passed to the next step.
- **Conformance suite:** the official tests proving an engine implementation follows its spec.
- **Lane (Nightshift):** a configured model slot, local or cloud, that serves requests.
- **Compute receipt:** Nightshift's record of which model served a request, with its token counts.

## 8. Where to look
- `docs/TEAM_UPDATE.md`: current status, in bullet points.
- `README.md`: architecture, engine mapping, how to run.
- `docs/SETUP.md`: machine setup.
- `docs/ZETARIS_FINDINGS.md`: the Zetaris bug write-up.
