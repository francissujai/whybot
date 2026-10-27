import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ConeGeometry, IcosahedronGeometry, MathUtils, ShaderMaterial, type Group } from "three";
import { MESH_VERT, RIM_FN } from "./glsl";
import type { SceneProps } from "./hero-types";

/** Five shards around a bright core are five competing explanations for one number. As the page scrolls, evidence rules four of them out:
 *  they dim and drift away. The one the data supports stays lit, with light running along it. */
const LOOP = 30; // seconds for one idle turn
const SHARDS = 5;
const CONFIRMED = 0;

const SHARD_FRAG = /* glsl */ `
uniform vec3 uAccent;
uniform vec3 uBase;
uniform float uRuled;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
${RIM_FN}
void main() {
  float f = rim(vNormal, vView, 3.6);
  float flow = smoothstep(0.55, 1.0, 1.0 - abs(fract(vUv.y * 1.5 - uTime * 0.2) - 0.5) * 2.0);
  vec3 col = uBase * soft(vNormal);
  col += uAccent * f * mix(1.15, 0.05, uRuled);
  col += uAccent * flow * 0.22 * (1.0 - uRuled);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const CORE_FRAG = /* glsl */ `
uniform vec3 uAccent;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
${RIM_FN}
void main() {
  float f = rim(vNormal, vView, 1.6);
  gl_FragColor = vec4(vec3(0.05, 0.06, 0.07) + uAccent * (0.12 + 0.75 * f), 1.0);
  #include <colorspace_fragment>
}`;

export function HeroScene({ accent, progress, pointer }: SceneProps) {
  const group = useRef<Group>(null);
  const shards = useRef<(Group | null)[]>([]);
  const ruled = useRef<number[]>(Array(SHARDS).fill(0));

  const geo = useMemo(() => ({ shard: new ConeGeometry(0.3, 1.5, 5), core: new IcosahedronGeometry(0.42, 2) }), []);
  const mats = useMemo(() => Array.from({ length: SHARDS }, () => new ShaderMaterial({
    vertexShader: MESH_VERT, fragmentShader: SHARD_FRAG,
    uniforms: { uAccent: { value: new Color(accent) }, uBase: { value: new Color("#14181d") }, uRuled: { value: 0 }, uTime: { value: 0 } },
  })), [accent]);
  const coreMat = useMemo(() => new ShaderMaterial({ vertexShader: MESH_VERT, fragmentShader: CORE_FRAG, uniforms: { uAccent: { value: new Color(accent) } } }), [accent]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime, p = progress.get(), px = pointer.current.x, py = pointer.current.y;
    g.rotation.y = (t / LOOP) * Math.PI * 2 + px * 0.25;
    g.rotation.x = MathUtils.damp(g.rotation.x, 0.75 + py * 0.15, 4, dt);
    g.position.x = MathUtils.damp(g.position.x, px * 0.18, 4, dt);
    g.position.y = MathUtils.damp(g.position.y, py * 0.12, 4, dt);
    let order = 0;
    for (let i = 0; i < SHARDS; i++) {
      const sh = shards.current[i];
      if (!sh) continue;
      // the confirmed shard never goes out; the others are ruled out one after another as progress passes 0.18, 0.38, 0.58, 0.78
      const out = i === CONFIRMED ? 0 : p > 0.18 + 0.2 * order++ ? 1 : 0;
      ruled.current[i] = MathUtils.damp(ruled.current[i], out, 3.5, dt);
      const r = ruled.current[i];
      sh.position.x = 0.5 * r;
      sh.scale.setScalar(1 - 0.22 * r);
      mats[i].uniforms.uRuled.value = r;
      mats[i].uniforms.uTime.value = t;
    }
  });

  return (
    <group ref={group}>
      <mesh geometry={geo.core} material={coreMat} />
      {Array.from({ length: SHARDS }, (_, i) => (
        <group key={i} rotation={[0, -(i / SHARDS) * Math.PI * 2, 0]}>
          <group ref={(el) => { shards.current[i] = el; }}>
            <mesh geometry={geo.shard} material={mats[i]} position={[1.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]} />
          </group>
        </group>
      ))}
    </group>
  );
}
