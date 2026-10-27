import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { m, useReducedMotion, type MotionValue } from "motion/react";
import { T_SLOW } from "../motion";
import type { Scene } from "./hero-types";
import { Poster } from "./poster";

// The canvas, three.js and the shader live in their own chunk, fetched only when the hero will actually render 3D.
const HeroCanvas = lazy(() => import("./HeroCanvas"));

/** Devices short on power or memory, or asking to save data, get the poster instead of the WebGL scene. */
function lowPower() {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2 || !!n.connection?.saveData;
}

function hasWebGL() {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}

/** The product's hero object. A static poster always renders first (it is the fallback and the LCP);
 *  the WebGL scene fades in over it once loaded, and stops drawing when off screen or in a hidden tab. */
export function Hero3D({ scene, accent, data, progress, label, caption }: { scene: Scene; accent: string; data?: number[]; progress: MotionValue<number>; label: string; caption: string }) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [render3d] = useState(() => !lowPower() && hasWebGL());
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [tabHidden, setTabHidden] = useState(document.hidden);

  useEffect(() => {
    if (!render3d || reduce) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(() => setMounted(true), { timeout: 1200 }) : window.setTimeout(() => setMounted(true), 200);
    return () => { if (!idle) window.clearTimeout(id); };
  }, [render3d, reduce]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    const onVis = () => setTabHidden(document.hidden);
    const onMove = (e: PointerEvent) => { pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) }; };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove); };
  }, []);

  return (
    <figure className="lp-object" ref={box}>
      <div className="lp-object-stage" role="img" aria-label={label}>
        <m.div className="lp-poster" animate={{ opacity: ready ? 0 : 1 }} transition={T_SLOW}><Poster scene={scene} accent={accent} /></m.div>
        {mounted && !reduce && (
          <m.div className="lp-canvas" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={T_SLOW}>
            <Suspense fallback={null}>
              <HeroCanvas accent={accent} data={data} progress={progress} pointer={pointer} active={visible && !tabHidden} onReady={() => setReady(true)} />
            </Suspense>
          </m.div>
        )}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
