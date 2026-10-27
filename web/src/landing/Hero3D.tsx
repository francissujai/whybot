import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { m, useReducedMotion, type MotionValue } from "motion/react";
import { T_SLOW } from "../motion";
import type { Scene } from "./hero-types";
import { Poster } from "./poster";

// The canvas, three.js and the shaders live in their own chunk, fetched only when the page will actually render 3D.
const HeroCanvas = lazy(() => import("./HeroCanvas"));

/** Devices short on power or memory, or asking to save data, get the poster instead of the WebGL scene. */
function lowPower() {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2 || !!n.connection?.saveData;
}

function hasWebGL() {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}

/** The product's hero object, and the WebGL layer that runs behind the whole page.
 *  The figure is the object's slot in the layout. A still poster fills it first (it is the fallback and the LCP); the WebGL canvas, which is
 *  full-bleed and fixed behind every section, fades in once loaded and draws the object over that slot plus a field of points that travels
 *  as you scroll. Drawing stops while the tab is hidden. */
export function Hero3D({ scene, accent, data, progress, page, label }: { scene: Scene; accent: string; data?: number[]; progress: MotionValue<number>; page: MotionValue<number>; label: string }) {
  const reduce = useReducedMotion();
  const slot = useRef<HTMLElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [render3d] = useState(() => !lowPower() && hasWebGL());
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [tabHidden, setTabHidden] = useState(document.hidden);

  useEffect(() => {
    if (!render3d || reduce) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(() => setMounted(true), { timeout: 1200 }) : window.setTimeout(() => setMounted(true), 200);
    return () => { if (!idle) window.clearTimeout(id); };
  }, [render3d, reduce]);

  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    const onMove = (e: PointerEvent) => { pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) }; };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pointermove", onMove); };
  }, []);

  return (
    <>
      <figure className="lp-object" ref={slot}>
        <div className="lp-object-stage" role="img" aria-label={label}>
          <m.div className="lp-poster" animate={{ opacity: ready ? 0 : 1 }} transition={T_SLOW}><Poster scene={scene} accent={accent} /></m.div>
        </div>
      </figure>
      {mounted && !reduce && (
        <m.div className="lp-canvas" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={T_SLOW}>
          <Suspense fallback={null}>
            <HeroCanvas accent={accent} data={data} progress={progress} page={page} pointer={pointer} slot={slot} active={!tabHidden} onReady={() => setReady(true)} />
          </Suspense>
        </m.div>
      )}
    </>
  );
}
