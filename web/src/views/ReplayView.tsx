import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { api, runDate, type RunInfo } from "../api";
import { caseAt, durationOf, formatClock, type TimedEvent } from "../caseModel";
import { CaseView } from "../components/CaseView";
import { EvidenceLedger } from "../components/Ledger";

const SPEEDS = [1, 4, 10];

/** A finished investigation replayed with its real timing. Drag the scrubber to any moment; the board and steps follow. */
export function ReplayView({ id, speed: initialSpeed, runs, onArchive, onHome }: { id: string; speed: number; runs: RunInfo[] | null; onArchive: () => void; onHome: () => void }) {
  const [items, setItems] = useState<TimedEvent[] | null>(null);
  const [error, setError] = useState("");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(initialSpeed);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.events(id).then((x) => live && setItems(x)).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [id]);

  const total = useMemo(() => (items ? durationOf(items) : 0), [items]);
  useEffect(() => {
    if (!playing || !items) return;
    const timer = window.setInterval(() => {
      setT((x) => {
        const next = Math.min(total, x + 100 * speed);
        if (next >= total) setPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, items, speed, total]);

  const c = useMemo(() => (items ? caseAt(items, t) : null), [items, t]);
  const question = c?.question ?? runs?.find((r) => r.runId === id)?.question;

  return (
    <div style={{ paddingTop: 24 }}>
      <nav className="crumbs" aria-label="Breadcrumb">
        <button onClick={onArchive}>Archive</button><span aria-hidden>/</span>
        <span>{runDate(id)}</span><span aria-hidden>/</span><span aria-current="page">Replay</span>
      </nav>
      {error ? (
        <div className="alert" role="alert" style={{ marginTop: 24 }}><b>This replay is not available.</b><span>{error}</span><div style={{ marginTop: 8 }}><Button onClick={onHome}>Back to investigate</Button></div></div>
      ) : !items || !c ? (
        <div role="group" aria-busy="true" aria-label="Loading the recording" style={{ marginTop: 32, maxWidth: 680 }}><div className="sk title" /><div className="sk line" /><div className="sk line" style={{ width: "70%" }} /></div>
      ) : (
        <>
          <div className="player" role="group" aria-label="Replay controls">
            <Button variant="primary" onClick={() => { if (t >= total) setT(0); setPlaying((p) => !p || t >= total); }}>{playing ? "Pause" : t >= total ? "Replay" : "Play"}</Button>
            <input type="range" min={0} max={total} step={100} value={t} aria-label="Position in the recording" aria-valuetext={`${formatClock(t)} of ${formatClock(total)}`}
              onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} />
            <div className="speeds" role="group" aria-label="Playback speed">
              {SPEEDS.map((s) => <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</button>)}
            </div>
            <span className="clock">{formatClock(t)} / {formatClock(total)}</span>
          </div>
          <div className="layout" style={{ paddingTop: 0 }}>
            <div className="col"><CaseView c={{ ...c, question: question ?? c.question }} elapsed={null} replayMs={t} active={active} onActive={setActive} /></div>
            <aside className="margin" aria-label="Evidence">
              {c.evidence.length > 0 && <EvidenceLedger evidence={c.evidence} active={active} onActive={setActive} />}
              <p className="small"><a href={`/runs/${id}/report.html`} target="_blank" rel="noreferrer">Open the saved report</a></p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
