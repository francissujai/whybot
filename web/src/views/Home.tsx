import { useState } from "react";
import { Button } from "../ui/Button";
import type { RunInfo } from "../api";
import { ArchiveList, ArchiveSkeleton } from "../components/Archive";
import { Ask } from "../components/Ask";
import { CaseView } from "../components/CaseView";
import { EvidenceLedger } from "../components/Ledger";
import type { useLive } from "../useLive";

type Live = ReturnType<typeof useLive>;

export function Home({ question, setQuestion, live, runs, loadingRuns, onInvestigate, onReplay, onArchive }: {
  question: string; setQuestion: (q: string) => void; live: Live; runs: RunInfo[] | null; loadingRuns: boolean;
  onInvestigate: () => void; onReplay: (id: string) => void; onArchive: () => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const c = live.current;
  const busy = live.active;
  return (
    <div className="layout">
      <div className="col">
        {!c && (
          <>
            <h1 className="display">Why did the number move?</h1>
            <p className="lead">Ask about a metric. WhyBot tests competing explanations against your data and shows the query behind every number.</p>
          </>
        )}
        <Ask value={question} onChange={setQuestion} onSubmit={onInvestigate} busy={busy} showExamples={!c} />
        {!c && runs && runs.length === 0 && (
          <div className="empty" style={{ marginTop: 32 }}>
            <b>No cases yet</b>
            Pick an example above and choose Investigate. An investigation needs Zetaris and a model lane; <span className="mono">npm run check</span> confirms both are ready.
          </div>
        )}
        {c && <CaseView c={c} elapsed={live.elapsed} onRetry={c.status === "failed" ? onInvestigate : undefined} active={active} onActive={setActive} />}
      </div>
      <aside className="margin" aria-label="Evidence and past cases">
        {c && c.evidence.length > 0 && <EvidenceLedger evidence={c.evidence} active={active} onActive={setActive} />}
        <section aria-label="Past cases">
          <h2 className="sub">Past cases</h2>
          {loadingRuns && !runs ? <ArchiveSkeleton /> : runs && runs.length > 0 ? (
            <>
              <ArchiveList runs={runs} limit={4} onReplay={onReplay} onAskAgain={(q) => { setQuestion(q); window.scrollTo({ top: 0 }); }} />
              {runs.length > 4 && <p style={{ margin: "12px 0 0" }}><Button variant="tertiary" onClick={onArchive}>All {runs.length} cases</Button></p>}
            </>
          ) : <p className="muted small">Finished investigations are kept here with their report and a replay.</p>}
        </section>
      </aside>
    </div>
  );
}
