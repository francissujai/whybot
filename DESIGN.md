# WhyBot design brief

## Product
**Who:** a marketing or growth lead who sees a metric move (signups down 18%) and has to explain why, with evidence, before a meeting.
**Job:** ask "why did this move?", watch competing explanations get tested, and leave with an answer whose every number links to its evidence.
**One line:** it investigates a metric change across your data and shows its work.

### Routes and flows
| Route | Purpose |
|---|---|
| `/` | Landing page: what WhyBot does |
| `/app` | Ask a question, follow a running investigation, open past cases |
| `/replay/<run>?speed=N` | Replay a finished investigation with its real timing |
| `/runs/<run>/report.html` | The saved report (served by the existing route) |

### Where a new user gets lost, and the fix
- Before: one flat list of cards for every model call and query; the explanation only appears at the end; replay is hidden.
- Now: the investigation is a case file with a hypothesis board that fills in as evidence arrives. Past cases sit in an archive with Report and Replay on each.
- Clicks to first value: 2 (pick an example question, Investigate) or 1 (Replay a past case).

## Design system (revamp v2)

The foundation is defined once in `web/src/foundation.css`. Components use the names in the app stylesheet, and each of those points at a foundation token, so no component holds a raw colour, size or duration.

- **Gray ramp.** `#000`, `#06080C`, `#111`, `#1F1F1F`, `#282828`, `#595959`, `#969696`, `#A3A3A3`, `#D9D9D9`, `#F2F2F2`; paper `#F2EDE6`.
- **Themes.** Dark is the base: black page, `#111` / `#1F1F1F` / `#282828` surfaces, `#969696` secondary text, translucent nav `rgba(22,22,23,0.8)`. Light is tuned separately: paper page, white surfaces, ink text, `#595959` secondary text, `#D9D9D9` lines. **Auto** follows the OS; **Light** and **Dark** override it and are kept in the browser (`data-theme` on `<html>`).
- **Type.** Inter Variable for everything. Display 72/72, title 32/1.1, both at weight 400 with -0.03em tracking; eyebrow 14px uppercase +0.12em at 500; body 16/24; button 15/20 +0.3px at 600. Weight is kept for buttons and small labels. SQL and run output use the system monospace.
- **Space and shape.** Sections 128 by 80 px (64 by 20 on phones), 1440 px container. Radius 8 px for buttons and inputs, 100 px pills, 6 px small cards, 20 px large panels; 1 px lines instead of shadows.
- **Breakpoints.** 375 (base), 768, 1009, 1440.
- **States.** Hover moves secondary text to primary in 150 ms; numbered rows shift 8 px and show an arrow; focus is a 2 px accent ring with a 2 px offset; disabled is 45% opacity; loading keeps the button width.
- **Motion tokens.** `--ds-ease-out` cubic-bezier(0.16, 1, 0.3, 1) for section entry (600 ms, once); `--ds-ease-app` cubic-bezier(0.2, 0, 0.2, 1) for app transitions (150 to 250 ms); the cycling word swaps in 350 ms every 2.8 s. Only transform and opacity animate. Reduced motion turns all of it off.

### Landing page (`/`)

The app moved to `/app`; every other URL is unchanged. The landing page follows one order: floating nav, hero, trust strip of real facts, five numbered capabilities, one pinned paper section with a word-by-word reveal, three product pillars with a live preview, closing line and footer. Scrolling uses Lenis (`lenis`, about 3 kB) for smooth, inertial scrolling on the landing page only; it turns itself off for reduced motion and is removed when you open the app. A canvas draws the hero object; everything else is CSS transitions driven by small scroll handlers. As the story section arrives the whole page blends from the theme colours to paper (ink in the light theme) and back, so sections change without hard edges, and the five capability rows fade up one after another.

- **Hero object.** It sits in the right track of the hero grid, centred on the headline, and shares its left edge with the statement and buttons; its edges fade out. A point cloud with perspective, depth fade and back-to-front drawing, on a dark disc with an accent rim light. It turns slowly, tilts toward the pointer, and drifts and fades as the hero scrolls away. It draws one still frame when reduced motion is on or the device is low power, and stops while off screen or in a hidden tab.
- **Copy rules.** Each headline says what the product does; facts and figures come from the product and its demo data; no testimonials, logos or invented metrics.

### WhyBot

- **Accent.** Highlighter yellow `#FFE14D` (fills, ink label), the same yellow as text on dark, ink on paper. The mark an editor puts on evidence.
- **Hero object.** A prism: five hypotheses leave one question; four fade (ruled out) and one stays lit and flows (confirmed).
- **Cycling word.** Test, Check, Explain: three things the product really does.
