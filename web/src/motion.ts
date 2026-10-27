// Motion tokens (the CSS tokens --dur-fast, --dur and --dur-slow carry the same durations).
// Motion in WhyBot shows the progress of reasoning: a card moves lanes when evidence changes its verdict. Fades and that one layout move only.
// MotionConfig reducedMotion="user" in main.tsx removes transform and layout animation when the OS asks.

export const MOVE = { duration: 0.25, ease: [0.16, 1, 0.3, 1] } as const;
export const FADE = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;
export const FADE_FAST = { duration: 0.14, ease: [0.22, 1, 0.36, 1] } as const;
