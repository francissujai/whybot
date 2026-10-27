import { useEffect, useRef, type ReactNode } from "react";
import { m } from "motion/react";
import { NUDGE, T_BASE } from "../motion";

/** The phone menu: a full-screen sheet with large links. Escape or Close shuts it and focus goes back to the Menu button. */
export function MenuSheet({ title, onClose, links, children }: {
  title: string;
  onClose: () => void;
  links: { label: string; current?: boolean; href?: string; onSelect: () => void }[];
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  // runs once per opening: move focus in, lock page scroll, and put both back on close
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("nav a")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; back?.focus(); };
  }, []);

  return (
    <m.div className="menu-sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} initial={{ opacity: 0, y: NUDGE }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={T_BASE}>
      <div className="menu-sheet-top">
        <span className="wordmark">{title}</span>
        <button type="button" className="menu-toggle" onClick={onClose}>Close</button>
      </div>
      <nav aria-label="Menu">
        {links.map((l) => (
          <a key={l.label} href={l.href ?? "#"} aria-current={l.current ? "page" : undefined}
            onClick={(e) => { e.preventDefault(); l.onSelect(); onClose(); }}>{l.label}</a>
        ))}
      </nav>
      {children && <div className="menu-sheet-extra">{children}</div>}
    </m.div>
  );
}
