import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { NUDGE, T_BASE } from "../motion";
import type { Step } from "../caseModel";
import { Ref } from "./Ref";

/** The investigation step by step. Each step lists its queries, the model calls behind it, and the compact state it carried forward. */
export function Steps({ steps, running, active, onActive }: { steps: Step[]; running: boolean; active: string | null; onActive: (id: string | null) => void }) {
  const [openByUser, setOpen] = useState<Record<number, boolean>>({});
  if (!steps.length) return null;
  const last = steps.length;
  return (
    <div className="steps">
      <AnimatePresence initial={false}>
      {steps.map((s) => {
        const seconds = s.calls.reduce((a, c) => a + c.seconds, 0);
        const open = openByUser[s.step] ?? (running && s.step === last);
        return (
          <m.details key={s.step} className="step" initial={{ opacity: 0, y: NUDGE }} animate={{ opacity: 1, y: 0 }} transition={T_BASE} open={open} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== open) setOpen((x) => ({ ...x, [s.step]: o })); }}>
            <summary>
              <span className="n">Step {s.step}</span>
              <span>{s.evidence.length ? s.evidence.map((e) => e.hypothesis).filter((v, i, a) => a.indexOf(v) === i).join(", ") : "Model call"}</span>
              <span className="t">{seconds ? `${seconds.toFixed(0)} s` : ""}</span>
            </summary>
            <div className="body">
              {s.evidence.map((e) => (
                <div className={`q ${e.error ? "err" : ""}`} key={e.id}>
                  <Ref id={e.id} active={active === e.id} onToggle={() => onActive(active === e.id ? null : e.id)} label={`${e.id}: ${e.purpose}`} />
                  <span>{e.purpose}{e.error ? ". The query failed and the model will fix it." : ""}</span>
                  <span className="rows">{e.rows} rows</span>
                </div>
              ))}
              {s.calls.length > 0 && <div className="calls">{s.calls.map((c, i) => <div key={i}>{c.model ?? "model"}{c.kind ? ` (${c.kind})` : ""} answered in {c.seconds.toFixed(0)} s{c.error ? `, failed: ${c.error}` : ""}</div>)}</div>}
              {s.state && (
                <details>
                  <summary className="summary-link">State carried to the next step</summary>
                  <pre className="state">{s.state}</pre>
                </details>
              )}
            </div>
          </m.details>
        );
      })}
      </AnimatePresence>
    </div>
  );
}
