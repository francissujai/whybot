import { m, useTransform } from "motion/react";
import { useSeg, type P } from "./film-kit";

/** One investigation, drawn as it happens. Chapters: ask the question and list the explanations, query the data, rule the explanations in or out,
 *  write the cited finding. Every element below is a transform of the scroll progress `p`. */
export const CHAPTERS = [["Ask. List", "every cause."], ["Query", "the data."], ["Rule causes", "in or out."], ["Cite", "every number."]];

const QUESTION = "Why did trial signups drop 18%?";
type Verdict = "confirmed" | "measurement" | "ruled-out";
const HYPOTHESES: { name: string; ev: string; what: string; verdict: Verdict; at: number }[] = [
  { name: "Ad budget change", ev: "E3", what: "Brand Search budget and clicks, 14 rows", verdict: "confirmed", at: 0.7 },
  { name: "Release 4.12.0 tracking", ev: "E2", what: "Mobile signup events, 28 rows", verdict: "measurement", at: 0.64 },
  { name: "Holiday", ev: "E4", what: "Holiday calendar", verdict: "ruled-out", at: 0.52 },
  { name: "Pricing change", ev: "E5", what: "Pricing history", verdict: "ruled-out", at: 0.58 },
];
const VERDICT_TEXT: Record<Verdict, string> = { confirmed: "Confirmed", measurement: "Measurement", "ruled-out": "Ruled out" };
const cy = (i: number) => 120 + i * 98;

function Row({ p, i }: { p: P; i: number }) {
  const h = HYPOTHESES[i];
  const enter = useSeg(p, i * 0.03, i * 0.03 + 0.08);
  const enterY = useTransform(enter, [0, 1], [56, 0]);
  const ev = useSeg(p, 0.26 + i * 0.022, 0.26 + i * 0.022 + 0.07);
  const evX = useTransform(ev, [0, 1], [100, 0]);
  const conn = useSeg(p, 0.3 + i * 0.03, 0.3 + i * 0.03 + 0.1);
  const v = useSeg(p, h.at, h.at + 0.05);
  const dim = useTransform(v, [0, 1], [1, h.verdict === "ruled-out" ? 0.3 : h.verdict === "measurement" ? 0.7 : 1]);
  const lift = useTransform(v, [0, 1], [1, h.verdict === "confirmed" ? 1.05 : 1]);
  // the explanations that were ruled out leave when the finding arrives; the confirmed one and its evidence stay
  const keep = useTransform(p, [0.74, 0.8], [1, h.verdict === "confirmed" ? 1 : 0]);
  const opCard = useTransform([enter, dim, keep], (a: number[]) => a[0] * a[1] * a[2]);
  const opEv = useTransform([ev, keep], (a: number[]) => a[0] * a[1]);
  const y = cy(i);
  return (
    <>
      <m.g style={{ opacity: opCard, y: enterY, scale: lift }} className="fl">
        <rect x="50" y={y} width="300" height="78" rx="12" className="f-card" />
        <m.rect x="50" y={y} width="300" height="78" rx="12" className={h.verdict === "measurement" ? "f-warn-line" : "f-acc-line"} style={{ opacity: h.verdict === "ruled-out" ? 0 : v }} />
        <text x="70" y={y + 34} className="f-t f-bold">{h.name}</text>
        <m.text x="70" y={y + 58} className={`f-t ${h.verdict === "confirmed" ? "f-acc-t" : h.verdict === "measurement" ? "f-warn-t" : "f-dim"} f-bold`} style={{ opacity: v }}>{VERDICT_TEXT[h.verdict]}</m.text>
        <m.line x1="70" x2="260" y1={y + 30} y2={y + 30} className="f-strike fl" style={{ scaleX: h.verdict === "ruled-out" ? v : 0 }} />
      </m.g>
      <m.path d={`M350 ${y + 39} H500`} className="f-link" style={{ pathLength: conn, opacity: keep }} />
      <m.g style={{ opacity: opEv, x: evX }}>
        <rect x="500" y={y} width="290" height="78" rx="12" className="f-card" />
        <rect x="518" y={y + 18} width="34" height="22" rx="4" className="f-mark" />
        <text x="535" y={y + 34} textAnchor="middle" className="f-t f-bold f-on-accent">{h.ev}</text>
        <text x="566" y={y + 34} className="f-t f-bold">{h.what.split(",")[0]}</text>
        <text x="518" y={y + 60} className="f-t f-dim">{h.what.includes(",") ? h.what.split(",")[1].trim() : "Read-only query"}</text>
      </m.g>
    </>
  );
}

function Finding({ p }: { p: P }) {
  const panel = useSeg(p, 0.78, 0.86);
  const py = useTransform(panel, [0, 1], [50, 0]);
  const ps = useTransform(panel, [0, 1], [0.94, 1]);
  const num = useTransform(p, [0.84, 0.93], [0, -18]);
  const numText = useTransform(num, (v) => `${v.toFixed(1)}%`);
  const l1 = useSeg(p, 0.86, 0.9), l2 = useSeg(p, 0.89, 0.93), l3 = useSeg(p, 0.92, 0.96);
  const c1 = useSeg(p, 0.9, 0.94), c2 = useSeg(p, 0.93, 0.97), c3 = useSeg(p, 0.95, 0.99);
  return (
    <m.g style={{ opacity: panel, y: py, scale: ps }} className="fc">
      <rect x="50" y="250" width="740" height="250" rx="16" className="f-card" />
      <m.text x="82" y="372" className="f-t f-huge f-bold" style={{ letterSpacing: "-0.04em" }}>{numText}</m.text>
      <m.text x="84" y="406" className="f-t f-dim" style={{ opacity: l1 }}>trial signups, week on week</m.text>
      <m.text x="360" y="312" className="f-t f-lg f-bold" style={{ opacity: l1 }}>Half the drop is a tracking gap.</m.text>
      <m.text x="360" y="344" className="f-t f-dim" style={{ opacity: l2 }}>Real loss: the Brand Search budget cut (E3).</m.text>
      <m.text x="360" y="376" className="f-t f-dim" style={{ opacity: l3 }}>Ruled out: the holiday and pricing.</m.text>
      <m.text x="82" y="482" className="f-t f-dim" style={{ opacity: l3, fontSize: 12 }}>Illustration based on a recorded run (samples/2026-10-24T02-21-21)</m.text>
      {[["E1", c1, 360], ["E2", c2, 424], ["E3", c3, 488]].map(([id, c, x]) => (
        <m.g key={id as string} style={{ opacity: c as never }}>
          <rect x={x as number} y="424" width="48" height="26" rx="5" className="f-mark" />
          <text x={(x as number) + 24} y="442" textAnchor="middle" className="f-t f-bold f-on-accent">{id as string}</text>
        </m.g>
      ))}
    </m.g>
  );
}

export function FilmScene({ p }: { p: P }) {
  const typed = useTransform(p, [0, 0.1], [0, QUESTION.length]);
  const qText = useTransform(typed, (v) => QUESTION.slice(0, Math.round(v)));
  const qO = useTransform(p, [0.74, 0.8], [1, 0.35]);
  return (
    <svg viewBox="0 0 840 540" className="film-svg" role="img" aria-label="One investigation: five explanations listed, queried, ruled in or out, and a cited finding written">
      <m.text x="50" y="76" className="f-t f-lg f-bold" style={{ opacity: qO }}>{qText}</m.text>
      {HYPOTHESES.map((h, i) => <Row key={h.name} p={p} i={i} />)}
      <Finding p={p} />
    </svg>
  );
}
