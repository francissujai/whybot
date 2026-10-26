import { useState } from "react";
import { applyTheme, getTheme, LABEL, NEXT } from "./theme-store";

/** Auto / Light / Dark switch for the top bar. */
export function ThemeButton({ className = "btn sm" }: { className?: string }) {
  const [t, setT] = useState(getTheme);
  return (
    <button className={className} onClick={() => { const n = NEXT[t]; applyTheme(n); setT(n); }}
      aria-label={`Colour theme: ${LABEL[t]}. Switch to ${LABEL[NEXT[t]]}`}>{LABEL[t]}</button>
  );
}
