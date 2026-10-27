import { useRef, useState, type ReactNode } from "react";
import { m, useMotionValueEvent, useScroll } from "motion/react";
import { ButtonLink } from "../ui/Button";
import { ThemeButton } from "../theme";
import { Reveal, T_BASE, useLenis, WordReveal } from "../motion";
import { Hero3D } from "./Hero3D";
import { Scrollytelling, type Step } from "./Scrollytelling";
import type { Scene } from "./hero-types";
import "./landing.css";

export interface LandingContent {
  product: string;
  /** a few plain words after the wordmark in the top bar */
  tagline: string;
  /** Instrument Serif headline. It may hold the page's one italic word (<em>). */
  headline: ReactNode;
  lede: string;
  /** the hero object: which scene, its accent colour (bright, it sits on a dark body), a label for assistive tech and one line on how its form follows the product */
  scene: Scene;
  accent: string;
  heroLabel: string;
  heroCaption: string;
  facts: { title: string; body: string }[];
  capsTitle: string;
  capsLede: string;
  capabilities: { title: string; body: string }[];
  why: string;
  storyTitle: string;
  story: Step[];
  /** the pinned view; it shows the product in the state of the current step */
  storyView: (step: number) => ReactNode;
  closing: string;
  footer: string;
}

/** The product landing page. `open` goes to an app URL without a page load. */
export function Landing({ c, open, data }: { c: LandingContent; open: (to: string) => void; data?: number[] }) {
  useLenis();
  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const { scrollY } = useScroll();
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
    <div className="lp">
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
            <div className="lp-hero-copy">
              <Reveal immediate as="h1" className="lp-display"><span id="lp-h1">{c.headline}</span></Reveal>
              <Reveal immediate delay={0.12} as="p" className="lp-lede">{c.lede}</Reveal>
              <Reveal immediate delay={0.24}><ButtonLink variant="primary" href="/app" onClick={go("/app")}>Open the app</ButtonLink></Reveal>
            </div>
            <Hero3D scene={c.scene} accent={c.accent} data={data} progress={heroProgress} label={c.heroLabel} caption={c.heroCaption} />
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
              <h2 className="lp-title" id="lp-caps">{c.capsTitle}</h2>
              <p>{c.capsLede}</p>
            </Reveal>
            <ol className="lp-caps">
              {c.capabilities.map((cap, i) => (
                <Reveal key={cap.title} as="li">
                  <span className="n">{i + 1}</span>
                  <h3>{cap.title}</h3>
                  <p>{cap.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-why" id="why" aria-label="Why it exists">
          <div className="lp-wrap">
            <WordReveal className="lp-statement" text={c.why} />
          </div>
        </section>

        <Scrollytelling id="product" title={c.storyTitle} steps={c.story} view={c.storyView} />

        <section className="lp-section lp-close" aria-labelledby="lp-close">
          <Reveal className="lp-wrap">
            <h2 className="lp-title" id="lp-close">{c.closing}</h2>
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
  );
}
