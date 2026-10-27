import { useRef, useState, type ReactNode } from "react";
import { m, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import type { P } from "./film-kit";

const pad = (n: number) => String(n).padStart(2, "0");

/** One line of a chapter title: it rises out of a mask when its chapter starts and leaves upward when the next one starts. */
function TitleLine({ p, text, from, to, k, first, last }: { p: P; text: string; from: number; to: number; k: number; first: boolean; last: boolean }) {
  const d = k * 0.014;
  const y = useTransform(p, [first ? -0.3 : from + d, first ? -0.2 : from + 0.06 + d, last ? 3 : to - 0.045, last ? 4 : to], ["118%", "0%", "0%", "-118%"]);
  return <span className="film-line"><m.span style={{ y }}>{text}</m.span></span>;
}

function Title({ p, lines, i, n }: { p: P; lines: string[]; i: number; n: number }) {
  const from = i / n, to = (i + 1) / n;
  const tag = useTransform(p, [i === 0 ? -0.3 : from, i === 0 ? -0.2 : from + 0.05, i === n - 1 ? 3 : to - 0.05, i === n - 1 ? 4 : to], [0, 1, 1, 0]);
  return (
    <div className="film-title" aria-hidden="true">
      <m.span className="film-tag" style={{ opacity: tag }}>{pad(i + 1)}</m.span>
      <h3>{lines.map((l, k) => <TitleLine key={l} p={p} text={l} from={from} to={to} k={k} first={i === 0} last={i === n - 1} />)}</h3>
    </div>
  );
}

function Seg({ p, i, n }: { p: P; i: number; n: number }) {
  const fill = useTransform(p, [i / n, (i + 1) / n], [0, 1]);
  return <li><m.i style={{ scaleX: fill }} /></li>;
}

/** A scene frozen at one progress value (for reduced motion). */
function Frozen({ at, scene }: { at: number; scene: (p: P) => ReactNode }) {
  const p = useMotionValue(at);
  return <>{scene(p)}</>;
}

/** A pinned, scroll-driven film. Progress is spring-smoothed, so the scene feels attached to your hand, and everything in it (titles, rings,
 *  the product scene, the camera tilt) is a transform of that one value. With reduced motion each chapter is shown once, as a still. */
export function Film({ id, label, chapters, scene }: { id: string; label: string; chapters: string[][]; scene: (p: P) => ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const n = chapters.length;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 150, damping: 28, mass: 0.35 });
  const [step, setStep] = useState(0);
  useMotionValueEvent(p, "change", (v) => setStep(Math.min(n - 1, Math.max(0, Math.floor(v * n)))));

  const tiltY = useTransform(p, [0, 1], [-11, 7]);
  const tiltX = useTransform(p, [0, 1], [7, -4]);
  const zoom = useTransform(p, [0, 0.5, 1], [0.92, 1, 1.05]);
  const ringRot = useTransform(p, [0, 1], [0, 160]);
  const ringScale = useTransform(p, [0, 1], [0.75, 1.3]);
  const dashRot = useTransform(p, [0, 1], [0, -240]);

  if (reduce) {
    return (
      <section className="lp-section" id={id} aria-label={label}>
        <div className="lp-wrap">
          <p className="film-label">{label}</p>
          <ol className="film-flat">
            {chapters.map((c, i) => (
              <li key={c.join(" ")}>
                <h3><span>{pad(i + 1)}</span>{c.join(" ")}</h3>
                <div className="film-stage"><Frozen at={(i + 1) / n - 0.01} scene={scene} /></div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section className="film" id={id} ref={ref} aria-label={label} style={{ height: `${n * 78 + 100}svh` }}>
      <div className="film-pin">
        <m.svg className="film-rings" viewBox="-400 -400 800 800" aria-hidden="true" style={{ rotate: ringRot, scale: ringScale }}>
          {[110, 190, 270, 350].map((r) => <circle key={r} r={r} className="f-ring" />)}
          <m.circle r="310" className="f-ring-dash" style={{ rotate: dashRot }} />
        </m.svg>
        <div className="lp-wrap film-wrap">
          <div className="film-top">
            <span className="film-label">{label}</span>
            <ol className="film-rail" aria-hidden="true">{chapters.map((c) => <Seg key={c.join(" ")} p={p} i={chapters.indexOf(c)} n={n} />)}</ol>
            <span className="film-count">{pad(step + 1)} / {pad(n)}</span>
          </div>
          <div className="film-body">
            <div className="film-titles">{chapters.map((c, i) => <Title key={c.join(" ")} p={p} lines={c} i={i} n={n} />)}</div>
            <div className="film-stage-wrap">
              <m.div className="film-stage" style={{ rotateX: tiltX, rotateY: tiltY, scale: zoom }}>{scene(p)}</m.div>
            </div>
          </div>
          <ol className="sr-only">{chapters.map((c) => <li key={c.join(" ")}>{c.join(" ")}</li>)}</ol>
        </div>
      </div>
    </section>
  );
}
