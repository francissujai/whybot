// Motion tokens (the CSS tokens --dur-fast, --dur and --dur-slow carry the same durations).
// Motion in WhyBot shows the progress of reasoning: a card moves when evidence changes its verdict.
// MotionConfig reducedMotion="user" in main.tsx removes transform and layout animation when the OS asks.

export const SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;
export const FADE = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;
export const FADE_FAST = { duration: 0.14, ease: [0.22, 1, 0.36, 1] } as const;
