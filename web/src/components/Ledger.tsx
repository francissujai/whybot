import type { Evidence } from "../caseModel";
import { Ref } from "./Ref";

/** Every query the investigation ran, in order. The same ids appear on the cards, in the steps and in the finding. */
export function EvidenceLedger({ evidence, active, onActive }: { evidence: Evidence[]; active: string | null; onActive: (id: string | null) => void }) {
  return (
    <section aria-label="Evidence">
      <h3 className="sub">Evidence</h3>
      <ol className="ledger">
        {evidence.map((e) => (
          <li key={e.id} data-active={active === e.id}>
            <Ref id={e.id} active={active === e.id} onToggle={() => onActive(active === e.id ? null : e.id)} label={`${e.id}: ${e.purpose}`} />
            <span>
              {e.hypothesis}
              <span className="what" style={{ display: "block" }}>{e.purpose}. {e.error ? "Query failed." : `${e.rows} rows.`}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
