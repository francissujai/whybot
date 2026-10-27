import { AnimatePresence, m } from "motion/react";
import { runDate, type RunInfo } from "../api";
import { NUDGE, T_BASE } from "../motion";
import { Button } from "../ui/Button";

/** Past cases, newest first. Each has its report and, when events were saved, a replay. */
export function ArchiveList({ runs, limit, onReplay, onAskAgain }: { runs: RunInfo[]; limit?: number; onReplay: (id: string) => void; onAskAgain: (q: string) => void }) {
  const shown = limit ? runs.slice(0, limit) : runs;
  return (
    <m.ul className="runs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={T_BASE}>
      <AnimatePresence initial={false}>
      {shown.map((r) => (
        <m.li layout className="run" key={r.runId} initial={{ opacity: 0, y: NUDGE }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={T_BASE}>
          <span className="q">{r.question}</span>
          <div className="date">{runDate(r.runId)}</div>
          <div className="acts">
            <a href={`/runs/${r.runId}/report.html`} target="_blank" rel="noreferrer">Report</a>
            {r.replay && <a href={`/replay/${r.runId}?speed=10`} onClick={(e) => { e.preventDefault(); onReplay(r.runId); }}>Replay</a>}
            <Button variant="tertiary" onClick={() => onAskAgain(r.question)}>Ask again</Button>
          </div>
        </m.li>
      ))}
      </AnimatePresence>
    </m.ul>
  );
}

export function ArchiveSkeleton() {
  return (
    <div role="group" aria-busy="true" aria-label="Loading past cases">
      {[0, 1, 2].map((i) => <div key={i} style={{ padding: "12px 0", borderTop: "1px solid var(--rule)" }}><div className="sk line" /><div className="sk line" style={{ width: "40%" }} /></div>)}
    </div>
  );
}
