# WhyBot: team update (22 Oct 2026)

**What it is**
- An agent that answers "Why did our metric move?" across several data sources.
- Every claim in its report links to the exact SQL and rows behind it.
- Entry for Open Agent Hackathon 2026, Track 02 ("The Agent That Can Explain Why"). **Submission deadline: Oct 27, 23:45 UTC.**

**Stack**
- **Data:** Zetaris, running locally in Docker. It federates 3 sources:
  - `ads_pg`: ad platform data (Postgres)
  - `app_pg`: product analytics plus backend accounts (Postgres)
  - `whybot.ca_holidays`: a live REST API (canada-holidays.ca)
- **Engines:** Meterless **Markovian** (runs the investigation in bounded steps) and **H-MEM** (remembers findings across sessions).
- **Model:** NVIDIA Nemotron through Meterless Nightshift, the only model provider.
- **Code:** TypeScript (Node 24).

**Demo scenario** (synthetic data with known, planted causes)
- The dashboard shows trial signups **−18%** week over week.
- Real accounts fell only **−9.3%**, so about half the "drop" is a tracking bug.
- The two causes:
  - Release 4.12.0 (Oct 13) broke mobile signup tracking. A measurement problem, not a business one.
  - The Brand Search budget was cut from $1,200 to $500 on Oct 13. A real loss.
- Red herrings the agent must rule out: Thanksgiving (Oct 12), pricing (unchanged), and an ad creative swap.

**Done**
- Data generated and loaded. The 3 sources are registered in Zetaris, and row counts match Postgres exactly.
- Both Meterless engines are our own code, and both pass the official conformance suites: **Markovian 8/8, H-MEM 13/13**.
- The agent loop works: hypotheses, then read-only SQL through Zetaris, an evidence ledger, verdicts, and an HTML report with a citation check.
- Guardrails:
  - read-only SQL
  - SQL lint that blocks queries known to return wrong results
  - the agent can't declare "done" until every hypothesis has a verdict
- Every model call is logged with Nightshift's compute receipt (which Nemotron model answered).
- Tests: 14/14 offline tests pass. `npm run check` passes for both Data and Power.

**Findings worth sharing**
- **Zetaris bug:** a query that reads the same table twice (two CTEs or a self-join) silently returns the first read's rows for both. Period comparisons come back as "no change". Details are in `docs/ZETARIS_FINDINGS.md`, and WhyBot blocks these queries.
- **Cloud Nemotron is too slow through Nightshift:** each call takes about 45 seconds of hidden reasoning, and many fail at Nightshift's 45-second deadline. A full run takes 20–40 minutes and may not finish.

**In progress / next**
- Switch to **local Nemotron** (Nemotron 3.5 Lightning 30B-A3B GGUF) on the RTX 5070 Ti. It should be faster, has no deadline, and adds a local-first story.
- Run the full investigation end to end, then a follow-up question that shows H-MEM recall.
- Submission pieces: 1–4 min demo video, deck, repo and README, and the integration write-up.
- Set up the git repo.

**Run it** (details in `README.md` and `docs/SETUP.md`)
- `npm install` → `npm run data:up` → `npm run check`
- `npm run why -- "Why did trial signups drop 18% last week?"` writes the report to `runs/<timestamp>/report.html`
- `npm test` · `npm run conformance`

**Secrets**
- Never commit `.env`. The NVIDIA key goes only in Nightshift.
