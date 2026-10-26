import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { HeroCanvas, type Scene } from "./HeroCanvas";
import { ThemeButton } from "../theme";
import "./landing.css";

export interface LandingContent {
  product: string;
  eyebrow: string;
  /** three real capabilities; the first is shown when motion is reduced */
  cycle: [string, string, string];
  rest: string;
  statement: string;
  facts: { title: string; body: string }[];
  capsEyebrow: string;
  capsTitle: string;
  capsLede: string;
  capabilities: { title: string; body: string }[];
  interludeEyebrow: string;
  interlude: string;
  pillarsEyebrow: string;
  pillarsTitle: string;
  pillars: { title: string; body: string; preview: ReactNode }[];
  closing: string;
  scene: Scene;
  footer: string;
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Cycles through three words with a vertical slide. A hidden sizer keeps the width fixed; pauses when the tab is hidden. */
function Cycle({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const id = window.setInterval(() => { if (!document.hidden) setI((v) => (v + 1) % words.length); }, 2800);
    return () => window.clearInterval(id);
  }, [words.length]);
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
  const prev = (i - 1 + words.length) % words.length;
  return (
    <span className="lp-cycle">
      <span className="sizer" aria-hidden="true">{longest}</span>
      {words.map((w, j) => <span key={w} className={j === i ? "on" : j === prev ? "out" : ""} aria-hidden={j !== i}>{w}</span>)}
    </span>
  );
}

/** One pinned scroll scene: each word goes from 45% to full opacity as the section scrolls past
 *  (45% keeps unread words above 3:1 contrast). */
function WordReveal({ eyebrow, text, children }: { eyebrow: string; text: string; children?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const words = useMemo(() => text.split(/\s+/), [text]);
  useEffect(() => {
    const el = ref.current!;
    const spans = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-w]"));
    if (reduced()) { spans.forEach((s) => (s.style.opacity = "1")); return; }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      // the whole page turns to paper as this section arrives and back as it leaves (eased, no hard edges)
      const enter = Math.min(1, Math.max(0, (vh * 0.95 - r.top) / (vh * 0.6)));
      const leave = Math.min(1, Math.max(0, (r.bottom - vh * 0.05) / (vh * 0.6)));
      const t = Math.min(enter, leave), eased = t * t * (3 - 2 * t);
      (el.closest(".lp") as HTMLElement | null)?.style.setProperty("--lp-mix", eased.toFixed(3));
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
      const n = spans.length;
      spans.forEach((s, i) => { const k = Math.min(1, Math.max(0, p * (n + 3) - i) / 3); s.style.opacity = String(0.45 + 0.55 * k); });
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    update();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, [words]);
  return (
    <section className="lp-interlude" ref={ref} id="story">
      <div className="lp-sticky lp-wrap">
        <p className="lp-eyebrow">{eyebrow}</p>
        <p className="lp-statement">{words.map((w, i) => <span data-w key={i}>{w}{i < words.length - 1 ? " " : ""}</span>)}</p>
        {children}
      </div>
    </section>
  );
}

/** The product landing page. `open` goes to an app URL without a page load. */
export function Landing({ c, open, data }: { c: LandingContent; open: (to: string) => void; data?: number[] }) {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState(false);
  const [pillar, setPillar] = useState(0);

  // smooth, inertial scrolling for the landing page only; app screens keep native scrolling.
  // Skipped when the OS asks for reduced motion.
  useEffect(() => {
    if (reduced()) return;
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, anchors: { offset: -88 }, autoRaf: true });
    return () => lenis.destroy();
  }, []);

  // section blocks fade up once as they enter
  useEffect(() => {
    const els = root.current!.querySelectorAll(".lp-reveal");
    if (reduced()) { els.forEach((e) => e.classList.add("is-in")); return; }
    // a scroll check instead of IntersectionObserver: a fast scroll can carry a block past the viewport in one frame,
    // and anything already above the fold must still be revealed
    let left = Array.from(els), raf = 0;
    const check = () => {
      raf = 0;
      const line = window.innerHeight * 0.9;
      left = left.filter((e) => { if (e.getBoundingClientRect().top < line) { e.classList.add("is-in"); return false; } return true; });
      if (!left.length) window.removeEventListener("scroll", on);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(check); };
    window.addEventListener("scroll", on, { passive: true });
    check();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", on); };
  }, []);

  // the hero object and headline drift apart as the hero scrolls away (transform and opacity only)
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = hero.current;
        if (h) h.style.setProperty("--lp-scroll", String(Math.min(1, Math.max(0, window.scrollY / h.offsetHeight))));
      });
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", on); };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); setMenu(false); open(to); };
  const links = [["Capabilities", "#capabilities"], ["How it works", "#story"], ["Product", "#product"]];

  return (
    <div className="lp" ref={root}>
      <a className="sr-only" href="#capabilities">Skip to content</a>
      <header className="lp-nav">
        <a className="lp-brand" href="/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }); }}><i aria-hidden="true" />{c.product}</a>
        <nav className="lp-links" aria-label="Sections">{links.map(([l, h]) => <a key={h} href={h}>{l}</a>)}</nav>
        <div className="lp-nav-end">
          <ThemeButton className="lp-pill" />
          <button className="lp-pill lp-menu" aria-expanded={menu} aria-controls="lp-sheet" onClick={() => setMenu((m) => !m)}>{menu ? "Close" : "Menu"}</button>
          <a className="lp-btn sm lp-cta-nav" href="/app" onClick={go("/app")}>Open the app</a>
        </div>
      </header>
      {menu && (
        <div className="lp-sheet" id="lp-sheet">
          <p className="lp-eyebrow">Sections</p>
          <nav aria-label="Sections">{links.map(([l, h]) => <a key={h} href={h} onClick={() => setMenu(false)}>{l}</a>)}</nav>
          <a className="lp-btn primary" href="/app" onClick={go("/app")}>Open the app</a>
        </div>
      )}

      <main>
      <section className="lp-hero" ref={hero} aria-labelledby="lp-h1">
        <div className="lp-hero-in">
          <HeroCanvas scene={c.scene} data={data} className="lp-object" />
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">{c.eyebrow}</p>
            <h1 className="lp-display" id="lp-h1"><Cycle words={c.cycle} />{c.rest}</h1>
          </div>
          <div className="lp-hero-side">
            <p>{c.statement}</p>
            <div className="lp-hero-actions">
              <a className="lp-btn primary" href="/app" onClick={go("/app")}>Open the app <span className="arrow" aria-hidden="true">→</span></a>
              <a className="lp-btn" href="#story">How it works</a>
            </div>
          </div>
          <a className="lp-scroll" href="#capabilities"><span aria-hidden="true" />Scroll</a>
        </div>
      </section>

      <section className="lp-trust" aria-label="Facts">
        <div className="lp-wrap">
          {c.facts.map((f, i) => (
            <div key={f.title} className="lp-reveal" style={{ transitionDelay: `${i * 80}ms` }}>
              <p className="lp-eyebrow">0{i + 1}</p>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="capabilities">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <div><p className="lp-eyebrow">{c.capsEyebrow}</p><h2 className="lp-title">{c.capsTitle}</h2></div>
            <p>{c.capsLede}</p>
          </div>
          <ol className="lp-caps">
            {c.capabilities.map((cap, i) => (
              <li key={cap.title} className="lp-reveal" style={{ transitionDelay: `${i * 70}ms` }}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{cap.title}</h3>
                <p>{cap.body}</p>
                <span className="go" aria-hidden="true">→</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <WordReveal eyebrow={c.interludeEyebrow} text={c.interlude}>
        <div><a className="lp-btn" href="/app" onClick={go("/app")}>See it on real data</a></div>
      </WordReveal>

      <section className="lp-section" id="product">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <div><p className="lp-eyebrow">{c.pillarsEyebrow}</p><h2 className="lp-title">{c.pillarsTitle}</h2></div>
          </div>
          <div className="lp-pillars lp-reveal">
            <div className="lp-plist" role="tablist" aria-label={c.pillarsTitle}
              onKeyDown={(e) => {
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                e.preventDefault();
                const n = (pillar + (e.key === "ArrowDown" ? 1 : c.pillars.length - 1)) % c.pillars.length;
                setPillar(n);
                (e.currentTarget.querySelectorAll("button")[n] as HTMLButtonElement)?.focus();
              }}>
              {c.pillars.map((p, i) => (
                <button key={p.title} role="tab" id={`lp-tab-${i}`} aria-selected={i === pillar} aria-controls={`lp-panel-${i}`} tabIndex={i === pillar ? 0 : -1}
                  onClick={() => setPillar(i)} onMouseEnter={() => setPillar(i)}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <span><strong>{p.title}</strong><span className="body"><span><span>{p.body}</span></span></span></span>
                </button>
              ))}
            </div>
            <div className="lp-preview">
              {c.pillars.map((p, i) => (
                <div key={p.title} role="tabpanel" id={`lp-panel-${i}`} aria-labelledby={`lp-tab-${i}`} aria-hidden={i !== pillar}>{p.preview}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-close">
        <div className="lp-wrap lp-reveal">
          <p className="lp-eyebrow">{c.product}</p>
          <h2 className="lp-display">{c.closing}</h2>
          <a className="lp-btn primary" href="/app" onClick={go("/app")}>Open the app <span className="arrow" aria-hidden="true">→</span></a>
        </div>
      </section>

      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span>{c.footer}</span>
          <nav aria-label="Footer"><a href="/app" onClick={go("/app")}>App</a><a href="#capabilities">Capabilities</a><a href="#story">How it works</a></nav>
        </div>
      </footer>
    </div>
  );
}
