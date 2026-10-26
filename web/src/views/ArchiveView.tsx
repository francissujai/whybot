import type { RunInfo } from "../api";
import { ArchiveList, ArchiveSkeleton } from "../components/Archive";

export function ArchiveView({ runs, loading, onReplay, onAskAgain }: { runs: RunInfo[] | null; loading: boolean; onReplay: (id: string) => void; onAskAgain: (q: string) => void }) {
  return (
    <div style={{ paddingTop: 48, maxWidth: 680 }}>
      <h1 className="display">Archive</h1>
      <p className="lead">Every finished investigation, with its report and a replay of how it unfolded.</p>
      {loading && !runs ? <ArchiveSkeleton /> : runs && runs.length ? (
        <ArchiveList runs={runs} onReplay={onReplay} onAskAgain={onAskAgain} />
      ) : (
        <div className="empty"><b>The archive is empty</b>Each investigation you run is saved here automatically.</div>
      )}
    </div>
  );
}
