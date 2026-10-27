/** Motion tokens: the only durations, curves and springs used in the code. The CSS twins are --ds-dur-* and --ds-ease-* in foundation.css. Seconds. */
export const DUR = { fast: 0.15, base: 0.25, slow: 0.4, reveal: 0.7 } as const;
export const EASE_ENTER = [0.22, 1, 0.36, 1] as const;
export const EASE_UI = [0.4, 0, 0.2, 1] as const;
export const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;

export const T_FAST = { duration: DUR.fast, ease: EASE_UI } as const;
export const T_BASE = { duration: DUR.base, ease: EASE_UI } as const;
export const T_SLOW = { duration: DUR.slow, ease: EASE_UI } as const;
export const T_REVEAL = { duration: DUR.reveal, ease: EASE_ENTER } as const;

/** Distances in px: a section rises 24 when it enters, a page slides 8 when it changes. */
export const RISE = 24;
export const NUDGE = 8;

/** A screen fades in and slides up 8px when it mounts. Give the element a key that changes with the route: <m.main key={route} {...PAGE}>. */
export const PAGE = { initial: { opacity: 0, y: NUDGE }, animate: { opacity: 1, y: 0 }, transition: T_BASE } as const;

/** For code outside React (chart.js): true when the OS asks for reduced motion. */
export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
