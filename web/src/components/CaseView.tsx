import type { Case } from "../caseModel";
import { Board } from "./Board";
import { CaseHead } from "./CaseHead";
import { Finding } from "./Finding";
import { Steps } from "./Steps";

/** One case, top to bottom: status and question, the hypothesis board, the steps, the finding. */
export function CaseView({ c, elapsed, replayMs, onRetry, active, onActive }: {
  c: Case; elapsed: number | null; replayMs?: number; onRetry?: () => void; active: string | null; onActive: (id: string | null) => void;
}) {
  const running = c.status === "running" || c.status === "queued";
  return (
    <>
      <CaseHead c={c} elapsed={elapsed} replayMs={replayMs} onRetry={onRetry} />
      {c.status === "queued" && <p className="muted" aria-live="polite">Waiting for the first evidence. Each model call takes 20 to 60 seconds.</p>}
      {c.hypotheses.length > 0 && (
        <section aria-labelledby="h-board">
          <h2 className="section" id="h-board">Hypotheses</h2>
          <Board hypotheses={c.hypotheses} active={active} onActive={onActive} judged={!!c.report} />
        </section>
      )}
      {c.steps.length > 0 && (
        <section aria-labelledby="h-steps">
          <h2 className="section" id="h-steps">Steps</h2>
          <Steps steps={c.steps} running={running} active={active} onActive={onActive} />
        </section>
      )}
      {(c.report || (running && c.hypotheses.length > 0)) && (
        <section aria-labelledby="h-finding">
          <h2 className="section" id="h-finding">Finding</h2>
          <Finding c={c} active={active} onActive={onActive} />
        </section>
      )}
    </>
  );
}
