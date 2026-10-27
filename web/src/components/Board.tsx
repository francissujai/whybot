import { AnimatePresence, LayoutGroup, m } from "motion/react";
import type { Hypothesis, Verdict } from "../caseModel";
import { SPRING, T_BASE } from "../motion";
import { Ref } from "./Ref";

type Lane = "tested" | Verdict;
const LANES: { key: Lane; title: string }[] = [
  { key: "tested", title: "Evidence gathered" },
  { key: "confirmed", title: "Confirmed" },
  { key: "measurement", title: "Measurement, not business" },
  { key: "ruled-out", title: "Ruled out" },
  { key: "unclear", title: "Unclear" },
];

/** Hypotheses as index cards. A card sits in "Evidence gathered" until the finding judges it, then glides to its verdict. */
export function Board({ hypotheses, active, onActive, judged }: { hypotheses: Hypothesis[]; active: string | null; onActive: (id: string | null) => void; judged: boolean }) {
  if (!hypotheses.length) return null;
  const laneOf = (h: Hypothesis): Lane => h.verdict ?? "tested";
  const lanes = LANES.filter((l) => l.key === "tested" || hypotheses.some((h) => laneOf(h) === l.key) || (judged && l.key !== "unclear"));
  return (
    <LayoutGroup id="board">
      <div className="board" role="group" aria-label="Hypotheses and their verdicts">
        {lanes.map((l) => {
          const cards = hypotheses.filter((h) => laneOf(h) === l.key);
          return (
            <section className="lane" data-v={l.key} key={l.key} aria-label={l.title}>
              <h3><span>{l.title}</span><span className="count">{cards.length}</span></h3>
              <div className="cards">
                <AnimatePresence initial={false}>
                  {cards.map((h) => (
                    <m.article key={h.key} layout="position" layoutId={`h-${h.key}`} className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ layout: SPRING, ...T_BASE }}>
                      <b>{h.name}</b>
                      <p className="p">{h.purposes[0]}{h.purposes.length > 1 ? ` and ${h.purposes.length - 1} more` : ""}. {h.rows} rows.</p>
                      <div className="chips">{h.evidence.map((id) => <Ref key={id} id={id} active={active === id} onToggle={() => onActive(active === id ? null : id)} />)}</div>
                    </m.article>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
