import { useState } from "react";
import { Button, type Variant } from "./ui/Button";
import { applyTheme, getTheme, LABEL, NEXT } from "./theme-store";

/** Auto / Light / Dark switch. Shown as a text button. */
export function ThemeButton({ variant = "tertiary", className }: { variant?: Variant; className?: string }) {
  const [t, setT] = useState(getTheme);
  return (
    <Button variant={variant} className={className} onClick={() => { const n = NEXT[t]; applyTheme(n); setT(n); }}
      aria-label={`Colour theme: ${LABEL[t]}. Switch to ${LABEL[NEXT[t]]}`}>Theme: {LABEL[t]}</Button>
  );
}
