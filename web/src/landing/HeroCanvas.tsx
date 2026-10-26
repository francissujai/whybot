import { useEffect, useRef } from "react";

/** Which hero object to draw. orbit: a stock pool ringed by one orbit per channel. chain: a ring of signed ledger
 *  blocks. prism: five hypotheses fanning out from one question, one of them confirmed. */
export type Scene = "orbit" | "chain" | "prism";

interface P { x: number; y: number; z: number; s: number; a: number; hot: number }

const TAU = Math.PI * 2;
const lowPower = () => {
  const n = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return !!n.connection?.saveData || (n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2;
};

function sphere(n: number, r: number, a: number, s: number): P[] {
  const out: P[] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), t = g * i;
    out.push({ x: Math.cos(t) * rr * r, y: y * r, z: Math.sin(t) * rr * r, s, a, hot: 0 });
  }
  return out;
}

function tilt(p: { x: number; y: number; z: number }, rx: number, rz: number) {
  const y1 = p.y * Math.cos(rx) - p.z * Math.sin(rx), z1 = p.y * Math.sin(rx) + p.z * Math.cos(rx);
  return { x: p.x * Math.cos(rz) - y1 * Math.sin(rz), y: p.x * Math.sin(rz) + y1 * Math.cos(rz), z: z1 };
}

/** Points for one frame at time t (seconds). `data` carries real product numbers where the scene uses them. */
function build(scene: Scene, t: number, data: number[], core: P[], dust: P[]): P[] {
  const pts: P[] = [...core, ...dust];
  if (scene === "orbit") {
    // one orbit per channel; the lit arc on each orbit is that channel's share of the stock pool
    const shares = data.length ? data : [35, 28, 6, 14];
    const total = shares.reduce((a, b) => a + b, 0) || 1;
    shares.forEach((sh, k) => {
      const r = 1.3 + k * 0.12, rx = 1.12 + k * 0.17, rz = -0.5 + k * 0.42, arc = (sh / total) * TAU, n = 240;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU + t * (0.18 + k * 0.05);
        const lit = (i / n) * TAU < arc;
        const q = tilt({ x: Math.cos(a0) * r, y: 0, z: Math.sin(a0) * r }, rx, rz);
        pts.push({ ...q, s: lit ? 2.4 : 0.9, a: lit ? 0.95 - k * 0.1 : 0.16, hot: lit ? 1 : 0 });
      }
      // a unit travelling along the lit arc
      const u = ((t * 0.35 + k * 0.25) % 1) * arc + t * (0.18 + k * 0.05);
      pts.push({ ...tilt({ x: Math.cos(u) * r, y: 0, z: Math.sin(u) * r }, rx, rz), s: 5, a: 1, hot: 2 });
    });
  } else if (scene === "chain") {
    // ledger blocks on a tilted ring; a signature pulse walks the chain; the next block is still empty
    const n = Math.max(12, Math.min(40, data[0] ?? 24));
    const head = Math.floor(t * 2.2) % n;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + t * 0.12;
      const c = tilt({ x: Math.cos(a0) * 1.38, y: 0, z: Math.sin(a0) * 1.38 }, 1.32, -0.28);
      const empty = i === n - 1;
      for (let j = 0; j < 16; j++) {
        const ox = ((j % 4) - 1.5) * 0.032, oy = (Math.floor(j / 4) - 1.5) * 0.032;
        const edge = j % 4 === 0 || j % 4 === 3 || j < 4 || j > 11;
        if (empty && !edge) continue;
        pts.push({ x: c.x + ox, y: c.y + oy, z: c.z, s: empty ? 1 : 1.6, a: empty ? 0.5 : 0.5 + 0.5 * (i / n), hot: i === head ? 2 : empty ? 0 : 1 });
      }
      // link to the next block
      const a1 = ((i + 1) / n) * TAU + t * 0.12;
      const d = tilt({ x: Math.cos(a1) * 1.38, y: 0, z: Math.sin(a1) * 1.38 }, 1.32, -0.28);
      for (let k = 2; k < 11; k++) {
        const f = k / 12;
        pts.push({ x: c.x + (d.x - c.x) * f, y: c.y + (d.y - c.y) * f, z: c.z + (d.z - c.z) * f, s: 0.9, a: 0.4, hot: 0 });
      }
    }
  } else {
    // five hypotheses leave one question; four fade (ruled out), one stays lit (confirmed)
    for (let h = 0; h < 5; h++) {
      const yaw = (h / 5) * TAU + t * 0.1, pitch = -0.35 + (h % 2) * 0.5, lit = h === 2;
      const dir = { x: Math.cos(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.sin(yaw) * Math.cos(pitch) };
      const n = 70;
      for (let i = 0; i < n; i++) {
        const f = i / n, sw = Math.sin(f * 9 + h + t * (lit ? 1.6 : 0.6)) * 0.06 * f;
        const flow = lit ? ((f * 5 - t * 1.2) % 1 + 1) % 1 : 1;
        pts.push({ x: dir.x * f * 1.9 + sw, y: dir.y * f * 1.9 + sw, z: dir.z * f * 1.9, s: lit ? 1.5 + f * 1.6 : 1.6,
          a: lit ? 0.45 + 0.55 * (1 - flow) : 0.75 * (1 - f * 0.45), hot: lit ? (flow < 0.08 ? 2 : 1) : 0 });
      }
      const end = { x: dir.x * 1.95, y: dir.y * 1.95, z: dir.z * 1.95 };
      for (const q of sphere(lit ? 22 : 16, lit ? 0.16 : 0.11, lit ? 1 : 0.6, lit ? 2 : 1.4)) pts.push({ ...q, x: q.x + end.x, y: q.y + end.y, z: q.z + end.z, hot: lit ? 1 : 0 });
    }
  }
  return pts;
}

function sprite(color: string, size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, color);
  r.addColorStop(0.25, color);
  r.addColorStop(1, "transparent");
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return c;
}

/** The landing hero object: a point cloud with real depth (perspective, depth fade, back-to-front order), a dark
 *  disc with an accent rim light, slow orbit and pointer tilt. Draws one still frame when the OS asks for reduced
 *  motion or the device is low power, and stops drawing while the hero is off screen or the tab is hidden. */
export function HeroCanvas({ scene, data = [], className = "lp-object" }: { scene: Scene; data?: number[]; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches || lowPower();
    const core = scene === "orbit" ? sphere(760, 0.92, 0.85, 1.6) : scene === "chain" ? sphere(420, 0.8, 0.5, 1.3) : sphere(120, 0.14, 0.95, 1.6);
    const dust = sphere(scene === "prism" ? 360 : 200, 2.6, 0.12, 0.9);
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true, t0 = performance.now();
    let tx = 0, ty = 0, rx = 0, ry = 0;
    let accent = "#fff", grey = "#a3a3a3", discA = "#1f1f1f", discB = "#06080c", hotS: HTMLCanvasElement, rimS: HTMLCanvasElement;

    const colors = () => {
      const st = getComputedStyle(document.documentElement);
      accent = st.getPropertyValue("--ds-object-accent").trim() || "#ffffff";
      grey = st.getPropertyValue("--ds-gray-250").trim() || grey;
      discA = st.getPropertyValue("--ds-gray-525").trim() || discA;
      discB = st.getPropertyValue("--ds-ink").trim() || discB;
      hotS = sprite(accent, 64);
      rimS = sprite(accent, 256);
    };
    const size = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    };

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      rx += (ty - rx) * 0.05; ry += (tx - ry) * 0.05;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const light = document.documentElement.getAttribute("data-theme") === "light" || (!document.documentElement.hasAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: light)").matches);
      // the canvas is a square in the layout grid; the object is centred in it
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.25;
      // dark disc with an accent rim light
      ctx.globalAlpha = light ? 0.22 : 0.45;
      ctx.drawImage(rimS, cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);
      ctx.globalAlpha = 1;
      const disc = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R * 1.08);
      disc.addColorStop(0, discA);
      disc.addColorStop(1, discB);
      ctx.fillStyle = disc;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, TAU); ctx.fill();

      const yaw = t * 0.16 + ry, pitch = -0.18 + rx;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const pts = build(scene, t, dataRef.current, core, dust).map((p) => {
        const x1 = p.x * cyw - p.z * syw, z1 = p.x * syw + p.z * cyw;
        const y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
        return { ...p, x: x1, y: y2, z: z2 };
      }).sort((a, b) => b.z - a.z);
      for (const p of pts) {
        const k = 3.4 / (3.4 + p.z), depth = Math.max(0.15, Math.min(1, 0.6 - p.z * 0.3));
        const sx = cx + p.x * R * k, sy = cy + p.y * R * k, s = p.s * k;
        if (p.hot) {
          const g = s * (p.hot === 2 ? 9 : 5);
          ctx.globalAlpha = p.a * depth * (p.hot === 2 ? 1 : 0.7);
          ctx.drawImage(hotS, sx - g / 2, sy - g / 2, g, g);
        } else {
          ctx.globalAlpha = p.a * depth;
          ctx.fillStyle = grey;
          ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => { draw(now); raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0; };
    const start = () => { if (!still && !raf) raf = requestAnimationFrame(loop); };

    colors(); size();
    draw(t0 + 4000);
    start();

    const ro = new ResizeObserver(() => { size(); if (still || !raf) draw(t0 + 4000); });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); });
    io.observe(cv);
    const onVis = () => { if (!document.hidden) start(); };
    const onTheme = () => { colors(); if (still) draw(t0 + 4000); };
    const onMove = (e: PointerEvent) => { tx = (e.clientX / window.innerWidth - 0.5) * 0.6; ty = (e.clientY / window.innerHeight - 0.5) * 0.4; };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("themechange", onTheme);
    mq.addEventListener("change", onTheme);
    if (!still) window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("themechange", onTheme);
      mq.removeEventListener("change", onTheme);
      window.removeEventListener("pointermove", onMove);
    };
  }, [scene]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
