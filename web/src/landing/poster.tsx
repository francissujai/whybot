import type { Scene } from "./hero-types";

/** Static still of the hero object: shown first, and instead of the WebGL scene on low-power devices and with reduced motion. */
export function Poster({ accent }: { scene: Scene; accent: string }) {
  const shards = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return { a, lit: i === 0 };
  });
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true">
      {shards.map((s, i) => {
        const d = s.lit ? 64 : 86;
        return (
          <g key={i} transform={`translate(200 200) rotate(${(s.a * 180) / Math.PI}) translate(${d} 0)`}>
            <polygon points="-24,-22 -24,22 76,0" fill="#14181d" stroke={s.lit ? accent : "#2a3038"} strokeWidth={s.lit ? 2 : 1.2} opacity={s.lit ? 1 : 0.6} />
          </g>
        );
      })}
      <circle cx="200" cy="200" r="27" fill="#0b0d11" stroke={accent} strokeWidth="2" />
    </svg>
  );
}
