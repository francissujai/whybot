import type { SessionEvent, TimedEvent } from "./caseModel";

export interface RunInfo { runId: string; question: string; replay: boolean }
export interface Status { running: { id: string; question: string } | null; runs: RunInfo[] }

/** Same endpoints the original page used; nothing here changes the server contract. */
export const api = {
  async status(): Promise<Status> {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Status;
  },
  async investigate(question: string): Promise<{ status: number; job?: string; error?: string }> {
    const res = await fetch("/api/investigate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
    const body = (await res.json()) as { job?: string; error?: string };
    return { status: res.status, ...body };
  },
  /** A saved run's events with their original timing (one JSON object per line). */
  async events(runId: string): Promise<TimedEvent[]> {
    const res = await fetch(`/runs/${encodeURIComponent(runId)}/events.jsonl`);
    if (!res.ok) throw new Error(res.status === 404 ? "No recording was saved for this case." : `HTTP ${res.status}`);
    return (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as TimedEvent);
  },
};

/** Follow a running investigation (server-sent events) until it ends. Returns a function that stops following. */
export function follow(job: string, onEvent: (e: SessionEvent) => void, onEnd: () => void): () => void {
  const es = new EventSource(`/api/jobs/${job}/events`);
  es.onmessage = (m) => onEvent(JSON.parse(m.data) as SessionEvent);
  const end = () => { es.close(); onEnd(); };
  es.addEventListener("end", end);
  es.onerror = end;
  return () => es.close();
}

export function runDate(runId: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/.exec(runId);
  if (!m) return runId;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return `${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}
