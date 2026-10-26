import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { api, type Status } from "./api";
import { EXAMPLES } from "./components/Ask";
import { Palette, type Command } from "./components/Palette";
import { useRoute } from "./router";
import { ThemeButton } from "./theme";
import { Landing } from "./landing/Landing";
import { content as landingContent } from "./landing/content";
import { useToast } from "./toasts";
import { useLive } from "./useLive";
import { ArchiveView } from "./views/ArchiveView";
import { Home } from "./views/Home";
import { ReplayView } from "./views/ReplayView";

export default function App() {
  const [route, go] = useRoute();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [palette, setPalette] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
    } catch (e) {
      toast(`Could not load past cases: ${(e as Error).message}`, false);
    } finally {
      setLoading(false);
    }
  }, [toast]);
  const live = useLive(refresh);
  const { attach, active } = live;

  // Load past cases once; join an investigation that is already running.
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (status?.running && !active) { setQuestion(status.running.question); attach(status.running.id, status.running.question); }
  }, [status, active, attach]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { document.title = route.name === "landing" ? "WhyBot: why did the number move?" : route.name === "archive" ? "Archive · WhyBot" : route.name === "replay" ? "Replay · WhyBot" : live.current?.question ? `${live.current.question} · WhyBot` : "WhyBot"; }, [route, live]);

  const investigate = useCallback((q?: string) => {
    const text = (q ?? question).trim();
    if (text.length < 8) return;
    setQuestion(text);
    go("/app");
    live.start(text);
  }, [question, go, live]);

  const runs = status?.runs ?? null;
  const commands = useMemo<Command[]>(() => [
    { id: "go-home", label: "Investigate", hint: "Go to", run: () => go("/app") },
    { id: "go-archive", label: "Archive", hint: "Go to", run: () => go("/app#archive") },
    ...EXAMPLES.map((q, i) => ({ id: `ask-${i}`, label: q, hint: "Investigate", run: () => investigate(q) })),
    ...(runs ?? []).flatMap((r) => [
      ...(r.replay ? [{ id: `replay-${r.runId}`, label: r.question, hint: "Replay", run: () => go(`/replay/${r.runId}?speed=10`) }] : []),
      { id: `report-${r.runId}`, label: r.question, hint: "Report", run: () => window.open(`/runs/${r.runId}/report.html`, "_blank") },
    ]),
  ], [go, investigate, runs]);

  const view = route.name === "replay" ? "replay" : route.name === "archive" ? "archive" : "home";
  if (route.name === "landing") return <Landing c={landingContent} open={go} />;

  return (
    <div className="frame">
      <header className="topbar">
        <button className="brand" onClick={() => go("/app")}>WhyBot</button>
        <nav className="nav" aria-label="Sections">
          <button aria-current={view === "home" ? "page" : undefined} onClick={() => go("/app")}>Investigate</button>
          <button aria-current={view === "archive" ? "page" : undefined} onClick={() => go("/app#archive")}>Archive</button>
        </nav>
        <span className="spacer" />
        <ThemeButton className="btn sm quiet" />
        <button className="btn sm quiet" onClick={() => setPalette(true)}>Search <span className="kbd hide-sm">Ctrl K</span></button>
      </header>
      <main id="main">
        {route.name === "home" && (
          <Home question={question} setQuestion={setQuestion} live={live} runs={runs} loadingRuns={loading} onInvestigate={() => investigate()}
            onReplay={(id) => go(`/replay/${id}?speed=10`)} onArchive={() => go("/app#archive")} />
        )}
        {route.name === "archive" && (
          <ArchiveView runs={runs} loading={loading} onReplay={(id) => go(`/replay/${id}?speed=10`)} onAskAgain={(q) => { setQuestion(q); go("/app"); }} />
        )}
        {route.name === "replay" && (
          <ReplayView key={route.id} id={route.id} speed={route.speed} runs={runs} onArchive={() => go("/app#archive")} onHome={() => go("/app")} />
        )}
      </main>
      <AnimatePresence>{palette && <Palette commands={commands} onClose={() => setPalette(false)} />}</AnimatePresence>
    </div>
  );
}
