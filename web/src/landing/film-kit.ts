import { useTransform, type MotionValue } from "motion/react";

/** Scroll progress through the film, 0 to 1. Every scene element is a function of this one value. */
export type P = MotionValue<number>;

/** A value that follows progress between a and b (clamped at both ends). */
export const useSeg = (p: P, a: number, b: number, from = 0, to = 1) => useTransform(p, [a, b], [from, to]);

/** 0 before a, fades up over `fade`, holds, and is back to 0 by b. */
export const useVis = (p: P, a: number, b: number, fade = 0.04) => useTransform(p, [a, a + fade, b - fade, b], [0, 1, 1, 0]);

const HEX = "0123456789abcdef";

/** Reveals `target` left to right as v goes 0 to 1; the unrevealed characters churn through random hex, like a hash being computed. */
export function scramble(target: string, v: number) {
  const reveal = v * (target.length + 2);
  const tick = Math.floor(v * 90);
  let out = "";
  for (let k = 0; k < target.length; k++) {
    if (k < reveal) { out += target[k]; continue; }
    const r = Math.sin((k + 1) * 12.9898 + tick * 78.233) * 43758.5453;
    out += HEX[Math.floor((r - Math.floor(r)) * 16)];
  }
  return out;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
