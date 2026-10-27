import { useEffect, useRef } from "react";
import { Button } from "../ui/Button";

export const EXAMPLES = [
  "Why did trial signups drop 18% last week?",
  "Why did mobile trial signups fall last week?",
  "Why did paid search signups drop last week?",
];
const MIN = 8;
const MAX = 300;

/** The question. Large, because the question is the product. Ctrl or ⌘ + Enter submits. */
export function Ask({ value, onChange, onSubmit, busy, showExamples }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean; showExamples: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const len = value.trim().length;
  const valid = len >= MIN && len <= MAX;
  useEffect(() => { if (!busy) ref.current?.focus(); }, [busy]);
  return (
    <form className="ask" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) onSubmit(); }}>
      <label htmlFor="question">What moved?</label>
      <textarea id="question" ref={ref} value={value} maxLength={MAX} placeholder="Why did trial signups drop 18% last week?" onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && valid && !busy) { e.preventDefault(); onSubmit(); } }} aria-describedby="ask-help" />
      <div className="ask-foot">
        <span id="ask-help" className="count">{len < MIN && len > 0 ? `${MIN - len} more characters needed` : `${len} of ${MAX}`}</span>
        <Button variant="primary" type="submit" disabled={!valid || busy}>{busy && <span className="spinner" aria-hidden />}{busy ? "Investigating" : "Investigate"}</Button>
      </div>
      {showExamples && (
        <ul className="examples" aria-label="Example questions">
          {EXAMPLES.map((q) => <li key={q}><Button variant="tertiary" onClick={() => onChange(q)}>{q}</Button></li>)}
        </ul>
      )}
    </form>
  );
}
