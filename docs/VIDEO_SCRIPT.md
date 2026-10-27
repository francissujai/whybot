# WhyBot demo video (target 3:00, limit 1–4 min)

**Recording:** silent 1920×1080 screen capture of the main monitor with ffmpeg. Long waits get sped up in the edit, and the voice-over is added afterwards (Clipchamp, built into Windows, works well). Read the narration below at a calm pace; each block fits its time slot.

## Setup (before recording)
- Nightshift: only `nemotron-local` running (the cloud lanes are stopped).
- `.env`: `NEMOTRON_MODEL=meterless/text.local`, `WHYBOT_CONTEXT_TOKENS=10000`.
- `npm run serve` restarted after the `.env` change. Chrome open at http://127.0.0.1:4173, maximized on the main screen, zoom 110%.
- Close notifications (Focus assist on). Hide the bookmarks bar.
- Clear memory for a clean first run: delete the `.whybot/memory` folder.

## Shot list

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:15 | WhyBot home page | "Monday morning: the dashboard says trial signups fell 18%. Was it the ads, a release, a holiday, or real demand? Answering that usually takes an analyst a day. WhyBot does it in minutes, and shows its evidence." |
| 0:15–0:30 | Click the first example question, then **Investigate** | "WhyBot runs entirely on this machine. Zetaris federates three sources: an ad-platform database, a product database, and a live public holidays API. NVIDIA Nemotron runs locally through Meterless Nightshift." |
| 0:30–1:30 | Timeline streaming (**sped up about 8×**) | "It quantifies the move, lists competing hypotheses, then tests one per step. Each query gets an evidence id. The Markovian engine carries only a compact state between steps, so the context stays flat. And a guard stops it from finishing until every hypothesis has a verdict." |
| 1:30–2:15 | Report: Answer and cause table, click an **[E#]** | "The answer: about half the drop isn't real. Release 4.12.0 broke mobile signup tracking. The real loss came from a Brand Search budget cut. Thanksgiving and pricing are ruled out. Every number links to the exact SQL and rows." |
| 2:15–2:35 | Scroll: citation check, context chart, **Model calls: Nemotron … local**, Memory | "A citation check flags any unsupported number. The receipts prove Nemotron answered every call, locally. H-MEM stores what it learned for next time." |
| 2:35–2:50 | Second question (*mobile*), show "Recalled N findings" (sped up) | "Ask a follow-up, and memory from the first investigation starts the second one ahead." |
| 2:50–3:00 | Terminal: `npm run conformance` (8/8, 13/13) | "Both Meterless engines are our own implementations, passing the official conformance suites. WhyBot: explanations you can check." |

## Recording commands (run from any terminal; these are what the agent runs)

```powershell
# start: primary monitor, 30 fps, crash-safe mkv
ffmpeg -y -f gdigrab -framerate 30 -offset_x 0 -offset_y 0 -video_size 1920x1080 -draw_mouse 1 -i desktop -c:v libx264 -preset ultrafast -crf 20 -pix_fmt yuv420p raw.mkv
# stop: press q in that window
```

## Edit
- Speed up the waiting: `ffmpeg -i raw.mkv -filter:v "setpts=PTS/8" -an fast.mp4` (for a single segment, trim it first with `-ss`/`-to`).
- Assemble in Clipchamp: trim, add the voice-over, add a title card ("WhyBot: why did the number move?") and an end card listing Zetaris · Meterless (Markovian, H-MEM, Nightshift) · NVIDIA Nemotron.
- Export 1080p MP4 and keep it **under 4:00**.
