import { useRef, useState, type ReactNode } from "react";
import { m, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { NUDGE, ScaleIn, T_BASE } from "../motion";

export interface Step { title: string; body: string }

/** Pins a product view while the page scrolls past it. The view changes state with each step and the matching text fades in beside it.
 *  With reduced motion the steps and their views are laid out one after another instead. */
export function Scrollytelling({ id, title, steps, view }: { id: string; title: string; steps: Step[]; view: (step: number) => ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.min(steps.length - 1, Math.max(0, Math.floor(v * steps.length)))));

  if (reduce) {
    return (
      <section className="lp-section" id={id} aria-labelledby={`${id}-h`}>
        <div className="lp-wrap">
          <h2 className="lp-title" id={`${id}-h`}>{title}</h2>
          <ol className="st-flat">
            {steps.map((s, i) => (
              <li key={s.title}><div><h3>{s.title}</h3><p>{s.body}</p></div><div className="lp-frame st-frame">{view(i)}</div></li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section className="st" id={id} ref={ref} aria-labelledby={`${id}-h`} style={{ height: `${steps.length * 90 + 100}svh` }}>
      <div className="st-pin">
        <div className="lp-wrap st-grid">
          <div className="st-text">
            <h2 className="lp-title" id={`${id}-h`}>{title}</h2>
            <div className="st-panels">
              {steps.map((s, i) => (
                <m.div key={s.title} className="st-panel" aria-hidden={i !== step} initial={false}
                  animate={{ opacity: i === step ? 1 : 0, y: i === step ? 0 : i < step ? -NUDGE : NUDGE }} transition={T_BASE}>
                  <span className="st-n">{i + 1} of {steps.length}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </m.div>
              ))}
            </div>
          </div>
          <ScaleIn className="st-view"><div className="lp-frame st-frame">{view(step)}</div></ScaleIn>
        </div>
      </div>
    </section>
  );
}

/** Stack of panes inside a story view; only the one for the current step is visible. */
export function StoryPanes({ step, children }: { step: number; children: ReactNode[] }) {
  return (
    <div className="st-panes">
      {children.map((c, i) => <div key={i} className="st-pane" data-on={i === step} aria-hidden={i !== step}>{c}</div>)}
    </div>
  );
}
