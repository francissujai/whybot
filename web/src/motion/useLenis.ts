import { useEffect } from "react";
import Lenis from "lenis";
import { cancelFrame, frame } from "motion/react";

/** Smooth scroll for the landing page only. Lenis runs on Motion's frame loop, so scroll-linked values and Lenis stay in step.
 *  Off when the OS asks for reduced motion; app screens never call it, so they keep native scroll. */
export function useLenis() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: false, lerp: 0.1 });
    const tick = ({ timestamp }: { timestamp: number }) => lenis.raf(timestamp);
    frame.update(tick, true);
    return () => { cancelFrame(tick); lenis.destroy(); };
  }, []);
}
