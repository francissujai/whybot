# Smoke tests

Run these after every change.

## Automated

```powershell
npm test                 # 23 offline tests (no stack needed; one takes ~15 s: it exercises the report retry back-off)
npm run typecheck
npm run web:build        # type-checks and builds the UI in web/ (run `npm run web:install` once first)
npm run conformance      # revert conformance/results/* afterwards if only timestamps changed

# with the web UI running (npm run serve):
npm run smoke            # HTTP smoke tests
```

`SMOKE_LIVE=1 npm run smoke` also runs a full investigation (needs Zetaris and Nightshift; takes minutes).
`WHYBOT_URL` changes the server (default http://127.0.0.1:4173).

## Manual (browser)

Open http://127.0.0.1:4173 and check the browser console after each flow (expected: no errors).

| # | Flow | Steps | Expected result | Needs |
|---|---|---|---|---|
| 1 | Page loads | Open `/app` | Brand bar, **Investigate** and **Archive** tabs, Search (Ctrl K), question box, three example questions, past cases column | web build |
| 2 | Example questions | Click one | Question box fills with it; **Investigate** is enabled | web build |
| 3 | Error path | Click **Investigate** without `.env` | Status "Failed", the question as heading, red box "MODEL_API_KEY is missing from .env" with **Investigate again** | web build |
| 4 | Investigate | Ask "Why did trial signups drop 18% last week?" | Status "Investigating" with a running clock; hypothesis cards appear under Evidence gathered, then glide to Confirmed, Measurement, or Ruled out; steps list fills; finding appears with evidence references | Zetaris + Nightshift |
| 5 | Evidence | Click an evidence reference in the finding | The evidence ledger scrolls to it and shows the query and rows; references are real buttons (Tab, Enter) | a completed run |
| 6 | Replay | **Replay** on a past case | Plays at 10x with the original timing; Play/Pause, the scrubber (arrow keys), 1x / 4x / 10x change position and speed; URL is `/replay/<id>?speed=10` and reloads to the same view | a completed run |
| 7 | Archive | Open **Archive** | Skeleton rows while loading, then every saved run with Report, Replay, Ask again; empty state when there are none | — |
| 8 | Search | Press Ctrl K | Palette opens with focus in the box; arrows move, Enter runs, Esc closes and returns focus | — |
| 9 | Dark and small screens | Switch the OS to dark; resize to 375 px | Colours follow the OS; the board is one column; no horizontal scroll; Search stays on the top row | — |
| 10 | Reduced motion | Turn on "reduce motion" in the OS | Cards jump to their lane instead of gliding; nothing else moves | a completed run |
| 11 | Memory | Ask "Why did mobile trial signups fall last week?" after flow 4 | "Recalled N findings from earlier cases" under the heading | flow 4 |
| 12 | CLI | `npm run check`, `npm run why -- "<question>"`, `npm run memory -- list` | Checks PASS; report written; memories listed | Zetaris + Nightshift |
| 13 | Landing page | Open `/` at 1440 px and at 375 px; scroll to the end | Attached top bar gains a rule after scrolling; the headline, one sentence and **Open the app** are visible without scrolling; the product views switch on click and with the arrow keys; **Open the app** goes to `/app` without a page load; at 375 px the links sit behind **Menu**, which opens a full-screen sheet that Escape closes; **Theme** in the footer switches Auto, Light and Dark | — |

Flows 4–6, 10, 11 and 12 cannot run without Zetaris and Nightshift.

## Screens to compare (before/after)

Home (empty), home after the error path, each at 1440 px and 375 px. With a live stack, add a running investigation and a report.
