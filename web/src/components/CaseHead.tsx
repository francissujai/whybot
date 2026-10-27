import type { Case } from "../caseModel";
import { Button } from "../ui/Button";
import { formatClock } from "../caseModel";

const LABEL = { idle: "Ready", queued: "Queued", running: "Investigating", done: "Finished", failed: "Failed" } as const;

/** Status, the question, and the numbers that say how far the investigation has got. */
export function CaseHead({ c, elapsed, replayMs, onRetry }: { c: Case; elapsed: number | null; replayMs?: number; onRetry?: () => void }) {
  const queries = c.evidence.length;
  const stepCount = c.steps.filter((s) => s.state !== undefined).length;
  // A run that never began reports a zero or negative duration; fall back to the clock on this page.
  const secs = c.seconds !== undefined && c.seconds > 0 ? c.seconds : elapsed;
  return (
    <header className="case-head">
      <span className={`status ${c.status}`} role="status"><i aria-hidden />{LABEL[c.status]}</span>
      <h2>{c.question}</h2>
      <div className="facts">
        {replayMs !== undefined && <span>Recording at {formatClock(replayMs)}</span>}
        <span>{stepCount} {stepCount === 1 ? "step" : "steps"}</span>
        <span>{queries} {queries === 1 ? "query" : "queries"}</span>
        {secs !== null && secs !== undefined && replayMs === undefined && <span>{secs < 90 ? `${secs.toFixed(0)} seconds` : `${(secs / 60).toFixed(1)} minutes`}</span>}
        {c.model && <span className="hide-sm">{c.model}</span>}
      </div>
      {c.status === "failed" && (
        <div className="alert" role="alert">
          <b>The investigation did not finish.</b>
          <span>{c.error}</span>
          {onRetry && <div style={{ marginTop: 8 }}><Button onClick={onRetry}>Investigate again</Button></div>}
        </div>
      )}
      {c.recalled.length > 0 && (
        <details className="note">
          <summary>Recalled {c.recalled.length} {c.recalled.length === 1 ? "finding" : "findings"} from earlier cases</summary>
          <ul>{c.recalled.map((r) => <li key={r.id}>{r.content}</li>)}</ul>
        </details>
      )}
      {c.guards.map((g) => <p className="note" key={g}>{g}</p>)}
    </header>
  );
}
