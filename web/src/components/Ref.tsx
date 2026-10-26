/** An evidence reference such as E3, marked like a source in an editor's copy. Press to highlight it in the evidence list and the finding. */
export function Ref({ id, active, onToggle, label }: { id: string; active: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" className="ref" aria-pressed={active} aria-label={label ?? `Evidence ${id}`} title={label} onClick={onToggle}>{id}</button>
  );
}
