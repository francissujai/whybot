# WhyBot audit

Audit of `jason/polish` at tag `baseline-before-polish`. Scoring weights used for ranking: Impact 30, Technical 20,
Innovation 15, Demo 15, Product & UX 10, Sponsor tech 10. Deadline Oct 27, 23:45 UTC.

Tested here: the web page, the error path with no `.env`, 16 unit tests, smoke tests, conformance (8/8, 13/13).
Not tested here (no Zetaris or Nightshift on this machine yet): a real investigation, the report, replay, memory recall.
Findings on those come from reading the code.

Overall: careful engineering. All page text is set with `textContent`, the SQL tool is read-only, the citation
checker is a real differentiator, and both Meterless engines pass the official suites. The weak spot is the demo:
an investigation takes minutes, and the replay that solves this is hidden.

## 1. Bugs and broken flows

| # | Severity | What fails | Where | Fix |
|---|---|---|---|---|
| B1 | Medium | After an error, the status line keeps saying "Starting…" (seen with no `.env`). The `error` event adds a red card but never resets the status | `src/ui/page.ts:89` (`error` case), `src/ui/page.ts:99-100` (`end` / `onerror`) | On `error`, call `setBusy(false, "Stopped: see the error below")` |
| B2 | Medium (demo) | Replay of a saved run (`/replay/<run>`) is only reachable through a tiny 11.5 px "replay" link nested inside the report link (an `<a>` inside an `<a>`, which is invalid HTML), with no speed control. (Correction: an earlier version of this audit said nothing linked to replay.) | `src/ui/page.ts:114` (`loadRuns`) | Separate "Report" and "Replay" links on each past run, plus a speed control (feature F1) |
| B3 | Low | When the report call fails, the writer waits 15 s, retries, and if that fails waits another 15 s before falling back. The second wait is wasted (it is also why two unit tests take 15 s each) | `src/agent/report.ts:56-61` | Only wait when another attempt follows |
| B4 | Low | `loadRuns()` has no error handling: if the server restarts, the page throws an unhandled rejection and the runs list stays stale | `src/ui/page.ts:112-117` | Wrap in try/catch and show "Could not load past investigations" |
| B5 | Low | No favicon: every page load logs a 404 in the console | `src/server.ts` (no `/favicon.ico` route), `src/ui/page.ts` (no `<link rel="icon">`) | Inline SVG favicon via a data URL in the page head |

## 2. Code quality

- Good: one session module shared by the CLI and the UI; evidence ledger; citation check; offline tests with a scripted model.
- The page is a 140-line template string with inline CSS and JS (`src/ui/page.ts`). Workable for small UI changes; a larger redesign would be easier as a static file.
- Duplicated with Ad Spend Autopilot: `src/engines/*`, `conformance/`, `src/llm/meterless.ts`. Expected for separate submissions.
- Hardcoded: example questions (`page.ts:61`), the "20–60 s per call" note (`page.ts:56`).

## 3. Security

| # | Severity | Issue | Where | Fix |
|---|---|---|---|---|
| — | OK | Binds `127.0.0.1` by default with a comment warning against exposing it; question length 8–300 and body size capped (`src/server.ts`); run ids regex-checked before file access; read-only SQL guard; all page text via `textContent`; no secrets in git history; `npm audit` clean |
| S1 | Low | `WHYBOT_HOST=0.0.0.0` would let anyone on the network start investigations that spend model time. Documented in `src/server.ts:7-9` | `src/server.ts` | None needed; keep the default |

## 4. Performance

- An investigation is several model calls of 20–60 s each, so a few minutes end to end. This is the main constraint (see demo risk).
- The page itself is about 11 KB with no external assets.
- Markovian keeps the per-step prompt flat; the report shows the token chart. Nothing to change.

## 5. Demo risk

| Risk | Where | Mitigation |
|---|---|---|
| A live investigation takes minutes; judges watching a recording will skip ahead, live viewers will wait | model calls | Record the video from a real run using replay at 8–10x (exists), and link replay from the page (F1) |
| Nightshift cloud lane slow or returns `502 provider_deadline` (documented in `docs/SETUP.md`) | `src/llm/meterless.ts` | Use the local Nemotron lane for the demo, or replay |
| Fresh machine: "Past investigations: None yet" | `runs/` is gitignored | Run one investigation on the demo machine before recording |
| Report call fails → 30 s of waiting, then a fallback report of raw notes | B3 | Fix B3; keep the fallback |
| Status stuck on "Starting…" after an error looks like a hang | B1 | Fix B1 |

## 6. UI review (first 60 seconds as a judge)

What a judge sees: a clean, plain page close to Apple's style already: system font, white cards, one blue accent, one primary button, three example questions. What is missing is a sense of the investigation: the timeline is a flat list of cards, and the most interesting part (competing hypotheses, each confirmed or ruled out with evidence) only appears in the final report.

| # | Screen | Now | Change | Why it helps a first-time user |
|---|---|---|---|---|
| U1 | Past investigations | Links open the static report in a new tab | Each run shows the question, date, and two actions: "Report" and "Replay" | Value in one click, without waiting minutes |
| U2 | Status line | Stuck on "Starting…" after errors (B1) | Clear states: Idle / Investigating (with timer) / Finished / Stopped | No apparent hang |
| U3 | Timeline | Every model call, query and Markovian state is a full-width card; long runs get noisy | Group by step; model calls become a one-line footnote; Markovian state behind a "Show state" disclosure | Easier to follow the reasoning |
| U4 | Investigation progress | Hypotheses only visible in the final report | A small board of hypotheses (ad change, release/tracking, pricing, holiday, demand) whose status moves from "untested" → "testing" → "confirmed" / "ruled out" as queries arrive (feature F2) | The judge sees the agent explaining why, live |
| U5 | Typography and spacing | System font at 15 px; mixed small sizes (11.5, 12, 12.5, 13, 13.5) | Inter → system UI stack; scale 12/13/15/17/22/28; 8-pt spacing | Cleaner hierarchy |
| U6 | Question box | `outline:none` on the textarea and no label | Visible focus ring on the card (`:focus-within`), `aria-label` on the textarea | Keyboard users can see where they are |
| U7 | Dark mode | None | Add `prefers-color-scheme: dark` tokens (the page uses CSS variables already) | Small effort; looks finished |
| U8 | Report | In an iframe fixed at 78 vh | Auto-size to content, or open it full width with a "Back to investigation" link | No nested scroll |
| U9 | Polish | No favicon (404) | Inline SVG favicon | Removes the console error |
| U10 | Motion | Smooth scroll on each new card | Keep; disable under `prefers-reduced-motion` | Accessibility |

### Top 5 UI changes (wow ÷ effort)

| Rank | Change | Effort | Break risk | Touches |
|---|---|---|---|---|
| 1 | U1 Report + Replay links on past runs | 0.5 h | Low | `page.ts` `loadRuns` |
| 2 | U2 + U6 + U9 status states, focus ring, label, favicon | 0.75 h | Low | `page.ts` |
| 3 | U3 grouped, quieter timeline | 1.5 h | Low | `page.ts` render functions only |
| 4 | U5 + U7 type scale, spacing, dark mode | 2 h | Low (CSS variables already exist) | `page.ts` CSS |
| 5 | U4 hypothesis board | 3 h | Medium | `page.ts`; reads existing `query` events |

## 7. Features (max 5)

| # | Feature | User problem | Why judges notice | Effort | Break risk | Depends on |
|---|---|---|---|---|---|---|
| **F1 (top pick)** | **Replay from the UI**: "Replay" on each past investigation, with a speed control (1x, 4x, 10x) | Investigations take minutes; replay exists but is hidden | Every demo shows a full real investigation in under a minute, labelled as a replay with real timings | S (1 h) | Low: uses the existing replay route and saved events | A completed run on the demo machine |
| F2 | **Live hypothesis board**: the competing hypotheses and their verdicts update as evidence arrives | The "why" only appears in the final report | Shows Track 2 ("connect findings, evidence-backed answers") while it happens: Impact and Demo | M (3 h) | Medium: needs hypothesis names from `query` events (already sent) and verdicts from the report step | — |
| F3 | **Feedback on findings from the report**: "Correct / Wrong" buttons that call H-MEM feedback (exists as `npm run memory -- feedback`) | Memory learning is CLI-only | Makes Meterless H-MEM visible in the product: Sponsor tech | M (2–3 h) | Low: new POST endpoint calling existing memory code | — |
| F4 | **Share / export**: download `report.md` and copy a link to the report | Users need to paste the answer into Slack or a doc | Concrete user value | S (0.5 h) | Low | — |
| F5 | **Stack check in the UI**: the `npm run check` results (Zetaris, Nightshift) shown before the first question | Errors appear only after clicking Investigate | Prevents demo surprises | S (1 h) | Low: new GET endpoint reusing `check` | — |

## 8. Suggested build order before the deadline

F1 + U1 (1 h) → B1/U2/U6/U9 (0.75 h) → B3 (0.25 h) → U3 (1.5 h) → F2 (3 h) → U5/U7 if time remains.
