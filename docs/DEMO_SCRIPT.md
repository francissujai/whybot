# WhyBot team demo script (about 15 minutes)

## Before the call (10 min)

- [ ] Docker Desktop running: Zetaris (4 containers) and `whybot-pg` are up. Check with `docker ps`.
- [ ] Nightshift open, lanes **ready**.
- [ ] A terminal in the repo folder, font zoomed in.
- [ ] Browser tabs:
  - [ ] `docs/OVERVIEW.md` on GitHub
  - [ ] http://localhost:3000 (Zetaris, logged in)
  - [ ] the latest `runs/<timestamp>/report.html`
- [ ] Run `npm run check` once (every line should PASS).
- [ ] **Start a live investigation in a second terminal 10–15 min before you present it:** `npm run why -- "Why did trial signups drop 18% last week?" --verbose`. Model calls take 20–45 seconds each, so it won't finish inside a live segment.

---

## 1. The why (2 min): show `docs/OVERVIEW.md`

> "Monday morning, the marketing lead sees trial signups down 18%. Is it the ads? A release? A holiday? Real demand? Answering that takes an analyst a day, and half the time the drop isn't even real."

> "We're in Track 02, *The Agent That Can Explain Why*: investigate across multiple data sources and give an evidence-backed answer. WhyBot does what a good analyst does: list the competing explanations, test each one with data, separate measurement problems from real business changes, and cite the evidence for every number."

## 2. The data (3 min): run `npm run demo:facts`

> "Here's the data WhyBot sees, all through **one SQL endpoint, Zetaris**, which federates three sources: an ad-platform database, a product database, and a live public holidays API."

Point at the output, top to bottom:
- **Dashboard −18%, but real accounts only −9.3%.** About half the drop isn't real.
- **Mobile tracking:**
  - Form submits stay flat while tracked signups fall from 120 to 56.
  - It starts right after release **4.12.0**, the new mobile signup stepper, on Oct 13 at 15:40.
  - That's a tracking bug, not lost customers.
- **Ads:** the *Brand Search* daily budget was cut from **$1,200 to $500** on Oct 13. That part of the loss is real.
- **Holidays (live REST API):** Thanksgiving was Monday Oct 12, but it's a one-day dip, so it's ruled out as the cause of the week.

> "No model involved yet. This is the ground truth the agent has to find on its own."

Optional: show the same federation in the Zetaris UI at localhost:3000.

## 3. The agent (5 min): the live run, then the report

Switch to the second terminal (started before the call). Walk through what's on screen:
- `H-MEM recalled …`: memory from past investigations (empty on the first run).
- `E1  H0  …`: every query gets an **evidence id**, and the model writes the SQL itself.
- `· investigate 21.3s Nemotron 3.5 …`: which **Nemotron** model answered, according to Nightshift's compute receipt.
- `step N done · carryover …`: the **Markovian engine**. Each step carries only a compact state, so the prompt stays the same size however many hypotheses it tests.
- `guard: completion refused …`: it isn't allowed to stop until every hypothesis has a verdict.

Then open `report.html` and show:
- **Answer** and the **"What explains the change" table**. Click an `[E3]` citation and it jumps to the exact SQL and rows.
- **Citation check:** flags any number that lacks evidence.
- **Context per step:** the flat Markovian prompt compared with a naive growing context.
- **Model calls:** the receipts proving Nemotron powered it.
- **Memory:** what H-MEM stored for next time.

## 4. Sponsor tech and proof (2 min)

Run `npm run conformance`.

> "Meterless engines count only if they power a real feature and pass the official tests. We wrote both ourselves: Markovian 8 of 8, H-MEM 13 of 13."

| Sponsor | What it does for WhyBot |
|---|---|
| **Zetaris** | one SQL endpoint over 3 sources, local in Docker |
| **Meterless engines** | Markovian (bounded steps) and H-MEM (memory across sessions) |
| **Meterless Nightshift** | the only model provider, on this machine |
| **NVIDIA Nemotron** | all the reasoning, proven by receipts |

> "We also found a real **Zetaris bug**: reading the same table twice in one query silently returns wrong numbers (`docs/ZETARIS_FINDINGS.md`). WhyBot blocks those queries automatically."

---

## If something breaks

| Problem | Do this |
|---|---|
| The live run is slow or fails with `502 provider_deadline` | Say "cloud calls are slow; this is why we're moving to local Nemotron" and show the pre-run `report.html` |
| `npm run check` fails Data | Zetaris may be stopped: `wsl -d Ubuntu -- sh -c "cd ~/zetaris-platform && docker compose start"`, then `npm run data:up` |
| `npm run check` fails Power | Nightshift isn't running, or the token changed (Nightshift → Console → copy to `.env`) |
| Everything is down | Walk through `docs/OVERVIEW.md` and a saved `report.html`; the story still lands |
