import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Color, Float32BufferAttribute, MathUtils, ShaderMaterial, type Group } from "three";
import type { SceneProps } from "./hero-types";

/** One field of points behind the whole page. A far layer and a near layer sit at different depths and move at different speeds as you scroll
 *  and as the pointer moves, so scrolling reads as travelling through space instead of sliding a flat picture. */
const FAR = 5200;
const NEAR = 170;

const rand = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

function cloud(n: number, xs: number, ys: number, zMin: number, zMax: number) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rand(i, 1) * 2 - 1) * xs;
    pos[i * 3 + 1] = (rand(i, 2) * 2 - 1) * ys;
    pos[i * 3 + 2] = MathUtils.lerp(zMin, zMax, rand(i, 3));
    seed[i] = rand(i, 4);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new Float32BufferAttribute(seed, 1));
  return g;
}

const POINT_VERT = /* glsl */ `
uniform float uTime;
uniform float uPx;
uniform float uSize;
uniform float uFade;
attribute float aSeed;
varying float vA;
varying float vTint;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.3 + aSeed * 20.0) * 0.07;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  float twinkle = 0.75 + 0.25 * sin(uTime * (0.6 + aSeed * 1.4) + aSeed * 40.0);
  vA = smoothstep(uFade, 5.0, d) * (0.25 + 0.75 * fract(aSeed * 7.0)) * twinkle;
  vTint = fract(aSeed * 13.0);
  gl_PointSize = uSize * uPx * (0.55 + fract(aSeed * 5.0)) / max(d, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const POINT_FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uAccent;
varying float vA;
varying float vTint;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  vec3 col = vTint < 0.14 ? uAccent : uBase;
  gl_FragColor = vec4(col, smoothstep(0.5, 0.1, d) * vA);
  #include <colorspace_fragment>
}`;

export function DepthField({ accent, page, pointer }: Pick<SceneProps, "accent" | "page" | "pointer">) {
  const far = useRef<Group>(null);
  const near = useRef<Group>(null);
  const layers = useMemo(() => {
    const mat = (size: number, fade: number, base: string) => new ShaderMaterial({
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uSize: { value: size }, uFade: { value: fade }, uBase: { value: new Color(base) }, uAccent: { value: new Color(accent) } },
    });
    return {
      far: { geometry: cloud(FAR, 17, 46, -17, 0.5), material: mat(44, 34, "#a7b1bd") },
      near: { geometry: cloud(NEAR, 9, 92, 1.2, 6.5), material: mat(80, 14, "#c3ccd6") },
    };
  }, [accent]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime, pg = page.get(), px = pointer.current.x, py = pointer.current.y;
    for (const l of [layers.far, layers.near]) { l.material.uniforms.uTime.value = t; l.material.uniforms.uPx.value = state.gl.getPixelRatio(); }
    if (far.current) {
      far.current.position.x = MathUtils.damp(far.current.position.x, px * 0.7, 3, dt);
      far.current.position.y = MathUtils.damp(far.current.position.y, pg * 34 + py * 0.4, 6, dt);
    }
    if (near.current) {
      near.current.position.x = MathUtils.damp(near.current.position.x, px * 1.8, 3, dt);
      near.current.position.y = MathUtils.damp(near.current.position.y, pg * 72 + py * 1.1, 6, dt);
    }
  });

  return (
    <>
      <group ref={far}><points geometry={layers.far.geometry} material={layers.far.material} frustumCulled={false} /></group>
      <group ref={near}><points geometry={layers.near.geometry} material={layers.near.material} frustumCulled={false} /></group>
    </>
  );
}
