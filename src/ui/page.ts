// The WhyBot web page: ask, watch the investigation stream, open the report.
// Self-contained HTML; all dynamic text is set with textContent.

export const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhyBot · why did the number move?</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230b6bcb'/%3E%3Ctext x='16' y='23' font-family='system-ui,sans-serif' font-size='19' font-weight='700' fill='white' text-anchor='middle'%3E%3F%3C/text%3E%3C/svg%3E">
<style>
:root{--ink:#16181d;--muted:#667085;--line:#e4e7ec;--bg:#fbfbfa;--card:#fff;--accent:#0b6bcb;--accent-soft:#eaf2fb;--warn:#b54708;--warn-soft:#fffaeb;--ok:#067647;--ok-soft:#ecfdf3;--bad:#b42318}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 24px 64px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:32px}
@media (max-width:900px){.wrap{grid-template-columns:1fr}}
h1{font-size:28px;letter-spacing:-.02em;margin:0}.tag{color:var(--muted);margin:4px 0 22px}
.stack{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:22px}.chip{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:var(--card);color:var(--muted)}
.ask{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
textarea{width:100%;border:0;resize:vertical;min-height:64px;font:inherit;font-size:17px;outline:none;background:transparent;color:var(--ink)}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap}
.examples{display:flex;gap:6px;flex-wrap:wrap}.ex{font-size:12.5px;border:1px solid var(--line);background:#f8f9fb;border-radius:6px;padding:4px 9px;cursor:pointer;color:var(--ink)}
.ex:hover{border-color:var(--accent)}
button.go{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer}
button.go:disabled{opacity:.5;cursor:not-allowed}
.status{margin:22px 0 8px;display:flex;justify-content:space-between;color:var(--muted);font-size:13px}
.timeline{display:flex;flex-direction:column;gap:8px}
.ev{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:14px}
.ev .k{font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-right:8px}
.ev.query{border-left:3px solid var(--accent)}.ev.step{border-left:3px solid var(--ink)}.ev.guard{border-left:3px solid var(--warn);background:var(--warn-soft)}
.ev.call{padding:6px 14px;font-size:12.5px;color:var(--muted);background:transparent;border-style:dashed}
.ev.error{border-left:3px solid var(--bad);color:var(--bad)}.ev.done{border-left:3px solid var(--ok);background:var(--ok-soft)}
.eid{display:inline-block;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:4px;padding:0 6px;font-size:12px;margin-right:6px}
pre.state{white-space:pre-wrap;margin:8px 0 0;font:12.5px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;color:#344054}
.report{margin-top:16px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}
.report iframe{width:100%;height:78vh;border:0;display:block}
.side h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:6px 0 10px}
.runs{display:flex;flex-direction:column;gap:6px}.runs a{display:block;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--ink);text-decoration:none;font-size:13.5px}
.runs a:hover{border-color:var(--accent)}.runs small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
.note{font-size:12.5px;color:var(--muted);margin-top:18px;line-height:1.5}
.ask:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.run{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13.5px}
.run .q{color:var(--ink);font-weight:500}.run small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
.run .acts{display:flex;gap:10px;margin-top:6px;font-size:12.5px}.run .acts a{color:var(--accent);text-decoration:none;font-weight:600}
.run .acts a:hover{text-decoration:underline}
details.state{margin-top:6px}details.state summary{cursor:pointer;color:var(--muted);font-size:12.5px}
.speed{display:inline-flex;gap:4px;margin-left:8px}.speed a{font-size:12px;border:1px solid var(--line);border-radius:6px;padding:1px 7px;color:var(--ink);text-decoration:none;background:var(--card)}
.speed a[aria-current="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
</style></head><body>
<div class="wrap">
<main>
  <h1>WhyBot</h1>
  <p class="tag">Ask why a metric moved. WhyBot tests competing explanations across your data and cites the evidence for every number.</p>
  <div class="stack"><span class="chip">Data: Zetaris (3 federated sources)</span><span class="chip">Engines: Meterless Markovian + H-MEM</span><span class="chip">Model: NVIDIA Nemotron via Nightshift</span></div>
  <div class="ask">
    <textarea id="q" maxlength="300" aria-label="Your question" placeholder="Why did trial signups drop 18% last week?"></textarea>
    <div class="row">
      <div class="examples" id="examples"></div>
      <button class="go" id="go">Investigate</button>
    </div>
  </div>
  <div class="status"><span id="status">Idle</span><span id="timer"></span></div>
  <div class="timeline" id="timeline"></div>
  <div class="report" id="report" hidden><iframe id="frame" title="Report"></iframe></div>
</main>
<aside class="side">
  <h2>Past investigations</h2>
  <div class="runs" id="runs"></div>
  <p class="note">Each investigation runs several model calls of 20-60 s, so expect a few minutes. Only one runs at a time; everything stays on this machine except the model calls your Nightshift lanes make.</p>
</aside>
</div>
<script>
const $ = (id) => document.getElementById(id);
const EXAMPLES = ["Why did trial signups drop 18% last week?", "Why did mobile trial signups fall last week?", "Why did paid search signups drop last week?"];
for (const ex of EXAMPLES) { const b = document.createElement("button"); b.className = "ex"; b.textContent = ex; b.onclick = () => { $("q").value = ex; $("q").focus(); }; $("examples").append(b); }

let started = 0, tick;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
function el(cls, parts) {
  const d = document.createElement("div"); d.className = "ev " + cls;
  for (const p of parts) {
    if (typeof p === "string") d.append(document.createTextNode(p));
    else { const s = document.createElement(p.tag || "span"); if (p.cls) s.className = p.cls; s.textContent = p.text; d.append(s); }
  }
  $("timeline").append(d); d.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" }); return d;
}
function setBusy(busy, text) {
  $("go").disabled = busy; $("status").textContent = text;
  clearInterval(tick);
  if (busy) { started = Date.now(); tick = setInterval(() => { $("timer").textContent = Math.round((Date.now() - started) / 1000) + " s"; }, 1000); }
}
function render(e) {
  switch (e.type) {
    case "start":
      if (location.pathname.startsWith("/replay/")) { $("status").textContent = "Replaying: investigated with " + e.model + " via " + e.provider; break; }
      setBusy(true, "Investigating with " + e.model + " via " + e.provider); break;
    case "memory": el("step", [{ cls: "k", text: "Memory" }, e.recalled.length ? "Recalled " + e.recalled.length + " findings from earlier investigations." : "Nothing relevant in memory yet."]); break;
    case "call": el("call", [e.error ? "Model call failed after " + e.seconds.toFixed(0) + " s, retrying" : (e.purpose === "report" ? "Report written by " : "Answered by ") + (e.model || "?") + " (" + (e.kind || "?") + ") in " + e.seconds.toFixed(0) + " s"]); break;
    case "query": el("query", [{ cls: "eid", text: e.id }, { cls: "k", text: e.hypothesis }, e.purpose + (e.error ? " - query rejected or failed, the model will fix it" : " - " + e.rows + " rows from Zetaris")]); break;
    case "guard": el("guard", [{ cls: "k", text: "Guard" }, e.message]); break;
    case "step": { const d = el("step", [{ cls: "k", text: "Step " + e.step }, "Finished; only a compact state carries to the next step (Markovian)"]);
      const det = document.createElement("details"); det.className = "state"; const sum = document.createElement("summary"); sum.textContent = "Show the state carried to the next step";
      const pre = document.createElement("pre"); pre.className = "state"; pre.textContent = e.state; det.append(sum, pre); d.append(det); break; }
    case "report": el("done", [{ cls: "k", text: "Report" }, "Citations: " + e.cited + " evidence ids cited, " + e.unknown + " unknown, " + e.uncited + " numbers without a citation."]); break;
    case "error": el("error", [{ cls: "k", text: "Error" }, e.message]); setBusy(false, "Stopped: see the error below"); break;
    case "done":
      setBusy(false, "Finished: " + e.status + " in " + Math.round(e.seconds) + " s, " + e.steps + " steps, " + e.queries + " queries");
      if (e.reportPath) { $("frame").src = "/runs/" + e.runId + "/report.html"; $("report").hidden = false; }
      loadRuns(); break;
  }
}
function follow(job) {
  const es = new EventSource("/api/jobs/" + job + "/events");
  es.onmessage = (m) => render(JSON.parse(m.data));
  es.addEventListener("end", () => { es.close(); $("go").disabled = false; clearInterval(tick); });
  es.onerror = () => { es.close(); $("go").disabled = false; clearInterval(tick); };
}
$("go").onclick = async () => {
  const question = $("q").value.trim() || $("q").placeholder;
  $("timeline").replaceChildren(); $("report").hidden = true;
  setBusy(true, "Starting...");
  const r = await fetch("/api/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
  const body = await r.json();
  if (r.status === 409) { el("guard", [{ cls: "k", text: "Busy" }, "Another investigation is running; following it instead."]); follow(body.job); return; }
  if (!r.ok) { setBusy(false, "Idle"); el("error", [body.error || "Could not start"]); return; }
  follow(body.job);
};
function link(text, href, blank) { const a = document.createElement("a"); a.textContent = text; a.href = href; if (blank) a.target = "_blank"; return a; }
async function loadRuns() {
  let s;
  try { s = await (await fetch("/api/status")).json(); }
  catch { $("runs").textContent = "Could not load past investigations."; return; }
  $("runs").replaceChildren(...s.runs.map((r) => {
    const card = document.createElement("div"); card.className = "run";
    const q = document.createElement("span"); q.className = "q"; q.textContent = r.question;
    const sm = document.createElement("small"); sm.textContent = r.runId.replace("T", " ").slice(0, 16) + " UTC";
    const acts = document.createElement("div"); acts.className = "acts";
    acts.append(link("Report", "/runs/" + r.runId + "/report.html", true));
    if (r.replay) acts.append(link("Replay", "/replay/" + r.runId + "?speed=10", false));
    card.append(q, sm, acts); return card;
  }));
  if (!s.runs.length) $("runs").textContent = "None yet.";
  if (s.running && !$("go").disabled) { $("q").value = s.running.question; setBusy(true, "Following a running investigation"); follow(s.running.id); }
}
loadRuns();

// Replay: /replay/<runId>?speed=10 plays a saved run's events with their real timing, sped up.
// (No backslashes here: this script lives inside a template literal.)
if (location.pathname.startsWith("/replay/")) startReplay(location.pathname.slice("/replay/".length));
async function startReplay(runId) {
  const speed = Number(new URLSearchParams(location.search).get("speed")) || 10;
  const r = await fetch("/runs/" + runId + "/events.jsonl");
  if (!r.ok) { el("error", ["No saved events for run " + runId + "."]); return; }
  const items = (await r.text()).split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));
  const total = items.length ? items[items.length - 1].t : 0;
  const start = items.find((i) => i.e.type === "start");
  if (start) $("q").value = start.e.question;
  $("go").disabled = true;
  const banner = document.createElement("div"); banner.className = "ev call";
  banner.textContent = "Replay of run " + runId + " at " + speed + "x. Original run took " + Math.round(total / 60000) + " min; timings below are real.";
  const speeds = document.createElement("span"); speeds.className = "speed";
  for (const x of [1, 4, 10]) { const a = link(x + "x", "?speed=" + x, false); if (x === speed) a.setAttribute("aria-current", "true"); speeds.append(a); }
  banner.append(speeds);
  $("timeline").before(banner);
  const wall = Date.now();
  clearInterval(tick);
  tick = setInterval(() => { const t = Math.min(total, (Date.now() - wall) * speed); $("timer").textContent = "original time " + Math.floor(t / 60000) + ":" + String(Math.floor(t / 1000) % 60).padStart(2, "0"); }, 250);
  for (const it of items) setTimeout(() => { render(it.e); if (it.e.type === "done") { clearInterval(tick); $("go").disabled = true; } }, it.t / speed);
}
</script>
</body></html>`;
