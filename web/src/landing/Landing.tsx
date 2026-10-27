import { useEffect, useState, type ReactNode } from "react";
import { ButtonLink } from "../ui/Button";
import { MenuSheet } from "../ui/MenuSheet";
import { ThemeButton } from "../theme";
import "./landing.css";

export interface LandingContent {
  product: string;
  /** Instrument Serif headline. It may hold the page's one italic word (<em>). */
  headline: ReactNode;
  lede: string;
  /** A framed view of the real app beside the headline. Leave it out for a typographic hero. */
  preview?: (data?: number[]) => ReactNode;
  previewLabel?: string;
  facts: { title: string; body: string }[];
  capsTitle: string;
  capsLede: string;
  capabilities: { title: string; body: string }[];
  why: string;
  pillarsTitle: string;
  pillars: { title: string; body: string; preview: ReactNode }[];
  closing: string;
  footer: string;
}

const SECTIONS = [["What it does", "capabilities"], ["Why", "why"], ["Product", "product"]] as const;

/** The product landing page. `open` goes to an app URL without a page load. */
export function Landing({ c, open, data }: { c: LandingContent; open: (to: string) => void; data?: number[] }) {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [pillar, setPillar] = useState(0);

  // the top bar gets its rule once the page scrolls, and the link for the section in view is marked
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 4);
      const line = window.innerHeight * 0.35;
      let current: string | null = null;
      for (const [, id] of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);

  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); open(to); };
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView();

  return (
    <div className="lp">
      <a className="sr-only skip" href="#capabilities">Skip to content</a>
      <header className={`lp-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="lp-nav-in">
          <a className="wordmark" href="/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); }}>{c.product}</a>
          <nav className="bar-links lp-links" aria-label="Sections">
            {SECTIONS.map(([label, id]) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined}>{label}</a>)}
          </nav>
          <button type="button" className="menu-toggle" aria-expanded={menu} onClick={() => setMenu(true)}>Menu</button>
          <ButtonLink variant="primary" className="lp-nav-cta" href="/app" onClick={go("/app")}>Open the app</ButtonLink>
        </div>
      </header>
      {menu && (
        <MenuSheet title={c.product} onClose={() => setMenu(false)}
          links={SECTIONS.map(([label, id]) => ({ label, href: `#${id}`, current: active === id, onSelect: () => jump(id) }))}>
          <ButtonLink variant="primary" href="/app" onClick={go("/app")}>Open the app</ButtonLink>
          <ThemeButton />
        </MenuSheet>
      )}

      <main>
        <section className={`lp-hero${c.preview ? " has-preview" : ""}`} aria-labelledby="lp-h1">
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <h1 className="lp-display" id="lp-h1">{c.headline}</h1>
              <p className="lp-lede">{c.lede}</p>
              <ButtonLink variant="primary" href="/app" onClick={go("/app")}>Open the app</ButtonLink>
            </div>
            {c.preview && <figure className="lp-frame" aria-label={c.previewLabel}>{c.preview(data)}</figure>}
          </div>
        </section>

        <section className="lp-facts" aria-label="Facts">
          <div className="lp-wrap">
            {c.facts.map((f) => (
              <div key={f.title}>
                <h2>{f.title}</h2>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section" id="capabilities" aria-labelledby="lp-caps">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2 className="lp-title" id="lp-caps">{c.capsTitle}</h2>
              <p>{c.capsLede}</p>
            </div>
            <ol className="lp-caps">
              {c.capabilities.map((cap, i) => (
                <li key={cap.title}>
                  <span className="n">{i + 1}</span>
                  <h3>{cap.title}</h3>
                  <p>{cap.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-why" id="why" aria-label="Why it exists">
          <div className="lp-wrap">
            <p className="lp-statement">{c.why}</p>
          </div>
        </section>

        <section className="lp-section" id="product" aria-labelledby="lp-product">
          <div className="lp-wrap">
            <div className="lp-head"><h2 className="lp-title" id="lp-product">{c.pillarsTitle}</h2></div>
            <div className="lp-pillars">
              <div className="lp-plist" role="tablist" aria-label={c.pillarsTitle} aria-orientation="vertical"
                onKeyDown={(e) => {
                  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                  e.preventDefault();
                  const n = (pillar + (e.key === "ArrowDown" ? 1 : c.pillars.length - 1)) % c.pillars.length;
                  setPillar(n);
                  e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[n]?.focus();
                }}>
                {c.pillars.map((p, i) => (
                  <button key={p.title} type="button" role="tab" id={`lp-tab-${i}`} aria-selected={i === pillar} aria-controls={`lp-panel-${i}`}
                    tabIndex={i === pillar ? 0 : -1} onClick={() => setPillar(i)}>
                    <strong>{p.title}</strong>
                    <span>{p.body}</span>
                  </button>
                ))}
              </div>
              <div className="lp-frame lp-panels">
                {c.pillars.map((p, i) => (
                  <div key={p.title} role="tabpanel" id={`lp-panel-${i}`} aria-labelledby={`lp-tab-${i}`} hidden={i !== pillar}>{p.preview}</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-close" aria-labelledby="lp-close">
          <div className="lp-wrap">
            <h2 className="lp-title" id="lp-close">{c.closing}</h2>
            <ButtonLink variant="primary" href="/app" onClick={go("/app")}>Open the app</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span>{c.footer}</span>
          <div className="lp-foot-end">
            <nav className="bar-links" aria-label="Footer">
              <a href="/app" onClick={go("/app")}>App</a>
              {SECTIONS.map(([label, id]) => <a key={id} href={`#${id}`}>{label}</a>)}
            </nav>
            <ThemeButton />
          </div>
        </div>
      </footer>
    </div>
  );
}
