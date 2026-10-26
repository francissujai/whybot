import type { ReactNode } from "react";
import { classifyVerdict, parseInline, parseMarkdown, type Case, type Evidence } from "../caseModel";
import { Ref } from "./Ref";

function Inline({ text, evidence, active, onActive }: { text: string; evidence: Evidence[]; active: string | null; onActive: (id: string | null) => void }) {
  return (
    <>
      {parseInline(text).map((p, i): ReactNode => {
        if (p.kind === "strong") return <strong key={i}>{p.text}</strong>;
        if (p.kind === "em") return <em key={i}>{p.text}</em>;
        if (p.kind === "ref") {
          return (
            <span key={i}>
              {p.ids.map((id) => {
                const ev = evidence.find((e) => e.id === id);
                return <Ref key={id} id={id} active={active === id} onToggle={() => onActive(active === id ? null : id)} label={ev ? `${id}: ${ev.purpose}, ${ev.rows} rows` : `${id}: not in this investigation's evidence`} />;
              })}
            </span>
          );
        }
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

/** The written finding. Every [E3] in the text is a reference to a query the investigation actually ran. */
export function Finding({ c, active, onActive }: { c: Case; active: string | null; onActive: (id: string | null) => void }) {
  if (!c.report) {
    return c.status === "failed" ? null : (
      <div role="group" aria-busy={c.status !== "done"} aria-label="The finding is written once the evidence is in">
        <div className="sk title" /><div className="sk line" /><div className="sk line" style={{ width: "92%" }} /><div className="sk line" style={{ width: "60%" }} />
      </div>
    );
  }
  const blocks = parseMarkdown(c.report.markdown);
  const inline = (t: string) => <Inline text={t} evidence={c.evidence} active={active} onActive={onActive} />;
  return (
    <article className="finding">
      {blocks.map((b, i) => {
        if (b.kind === "heading") return <h3 key={i}>{b.text}</h3>;
        if (b.kind === "para") return <p key={i}>{inline(b.text)}</p>;
        if (b.kind === "list") return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>;
        const vi = b.header.findIndex((h) => h.toLowerCase().includes("verdict"));
        return (
          <div className="tablewrap" key={i}>
            <table>
              <thead><tr>{b.header.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>{row.map((cell, k) => <td key={k}>{k === vi ? <span className="verdict" data-v={classifyVerdict(cell)}>{inline(cell)}</span> : inline(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="finding-foot">
        <span>
          {c.report.cited} evidence references checked
          {c.report.unknown > 0 && `, ${c.report.unknown} unknown`}
          {c.report.uncited > 0 && `, ${c.report.uncited} numbers without a citation`}
          {c.report.unknown === 0 && c.report.uncited === 0 && ", every number cited"}
        </span>
        {c.runId && c.reportPath && <a href={`/runs/${c.runId}/report.html`} target="_blank" rel="noreferrer">Open the full report</a>}
      </div>
    </article>
  );
}
