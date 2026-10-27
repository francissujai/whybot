import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { m, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, useVelocity, type MotionValue } from "motion/react";
import { ButtonLink } from "../ui/Button";
import { ThemeButton } from "../theme";
import { Reveal, T_BASE, useLenis, WordReveal } from "../motion";
import { Hero3D } from "./Hero3D";
import { Film } from "./Film";
import type { P } from "./film-kit";
import type { Scene } from "./hero-types";
import "./landing.css";

export interface LandingContent {
  product: string;
  /** a few plain words after the wordmark in the top bar */
  tagline: string;
  /** The headline, in the display weight. It may hold the page's one italic word (<em>). */
  headline: ReactNode;
  lede: string;
  /** the hero object: which scene, its accent colour (bright, it sits on a dark body), a label for assistive tech and one line on how its form follows the product */
  scene: Scene;
  accent: string;
  heroLabel: string;
  facts: { title: string; body: string }[];
  capsTitle: string;
  capsLede: string;
  capabilities: { title: string; body: string }[];
  why: string;
  /** the pinned scroll film: a small label, the chapter titles (lines of big type), and the scene drawn from scroll progress */
  filmLabel: string;
  chapters: string[][];
  film: (p: P) => ReactNode;
  closing: string;
  footer: string;
}

const SkewCtx = createContext<MotionValue<number> | null>(null);

/** Headings lean a few degrees with scroll speed and settle when you stop (skewY, driven by the page's scroll velocity). */
function Skew({ children }: { children: ReactNode }) {
  const skew = useContext(SkewCtx);
  return <m.div style={skew ? { skewY: skew, originX: 0 } : undefined}>{children}</m.div>;
}

/** A capability row scrubbed by scroll: its number shrinks into place from 2.6x while the title and text slide in. */
function CapRow({ i, title, body }: { i: number; title: string; body: string }) {
  const ref = useRef<HTMLLIElement>(null);
  const reduce = useReducedMotion();
  const skew = useContext(SkewCtx);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.96", "start 0.55"] });
  const n = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 2.6, 1]);
  const o = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.1, 1]);
  const x = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : -70, 0]);
  const bx = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 40, 0]);
  return (
    <m.li ref={ref} style={skew ? { skewY: skew, originX: 0 } : undefined}>
      <m.span className="n" style={{ scale: n, opacity: o, originX: 0 }}>{i + 1}</m.span>
      <m.h3 style={{ x, opacity: o }}>{title}</m.h3>
      <m.p style={{ x: bx, opacity: o }}>{body}</m.p>
    </m.li>
  );
}

/** The product landing page. `open` goes to an app URL without a page load. */
export function Landing({ c, open, data }: { c: LandingContent; open: (to: string) => void; data?: number[] }) {
  useLenis();
  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const { scrollY, scrollYProgress: pageProgress } = useScroll();
  const reduce = useReducedMotion();
  const bar = useSpring(pageProgress, { stiffness: 140, damping: 30 });
  const skew = useTransform(useSpring(useVelocity(scrollY), { stiffness: 260, damping: 40 }), [-3000, 3000], [-4, 4]);
  const copyY = useTransform(heroProgress, [0, 1], [0, -90]);
  const copyO = useTransform(heroProgress, [0, 0.75], [1, 0]);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  // the top bar gains a rule and a slight background once the page scrolls, hides on the way down and returns on the way up
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 4);
    if (y > prev && y > 160) setHidden(true);
    else if (y < prev) setHidden(false);
  });

  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); open(to); };

  return (
    <SkewCtx.Provider value={reduce ? null : skew}>
    <div className="lp">
      <m.div className="lp-progress" style={{ scaleX: bar }} aria-hidden="true" />
      <a className="sr-only skip" href="#capabilities">Skip to content</a>
      <m.header className={`lp-nav${scrolled ? " is-scrolled" : ""}`} initial={false} animate={{ y: hidden ? "-100%" : 0 }} transition={T_BASE} onFocusCapture={() => setHidden(false)}>
        <div className="lp-nav-in">
          <a className="wordmark" href="/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); }}>{c.product}</a>
          <span className="lp-tagline">{c.tagline}</span>
          <a className="lp-nav-app" href="/app" onClick={go("/app")}>Open the app <span aria-hidden="true">→</span></a>
        </div>
      </m.header>

      <main>
        <section className="lp-hero" ref={hero} aria-labelledby="lp-h1">
          <div className="lp-wrap lp-hero-in">
            <m.div className="lp-hero-copy" style={{ y: copyY, opacity: copyO }}>
              <Reveal immediate as="h1" className="lp-display"><span id="lp-h1">{c.headline}</span></Reveal>
              <Reveal immediate delay={0.12} as="p" className="lp-lede">{c.lede}</Reveal>
              <Reveal immediate delay={0.24}><ButtonLink variant="primary" href="/app" onClick={go("/app")}>Open the app</ButtonLink></Reveal>
            </m.div>
            <Hero3D scene={c.scene} accent={c.accent} data={data} progress={heroProgress} page={bar} label={c.heroLabel} />
          </div>
        </section>

        <section className="lp-facts" aria-label="Facts">
          <div className="lp-wrap">
            {c.facts.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.08}>
                <h2>{f.title}</h2>
                <p>{f.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="lp-section" id="capabilities" aria-labelledby="lp-caps">
          <div className="lp-wrap">
            <Reveal className="lp-head">
              <Skew><h2 className="lp-title" id="lp-caps">{c.capsTitle}</h2></Skew>
              <p>{c.capsLede}</p>
            </Reveal>
            <ol className="lp-caps">
              {c.capabilities.map((cap, i) => <CapRow key={cap.title} i={i} title={cap.title} body={cap.body} />)}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-why" id="why" aria-label="Why it exists">
          <div className="lp-wrap">
            <Skew><WordReveal className="lp-statement" text={c.why} /></Skew>
          </div>
        </section>

        <Film id="product" label={c.filmLabel} chapters={c.chapters} scene={c.film} />

        <section className="lp-section lp-close" aria-labelledby="lp-close">
          <Reveal className="lp-wrap">
            <Skew><h2 className="lp-title" id="lp-close">{c.closing}</h2></Skew>
            <ButtonLink variant="primary" href="/app" onClick={go("/app")}>Open the app</ButtonLink>
          </Reveal>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span>{c.footer}</span>
          <div className="lp-foot-end">
            <nav className="bar-links" aria-label="Footer"><a href="/app" onClick={go("/app")}>App</a></nav>
            <ThemeButton />
          </div>
        </div>
      </footer>
    </div>
    </SkewCtx.Provider>
  );
}
