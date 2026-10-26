import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, follow } from "./api";
import { buildCase, queuedCase, type Case, type SessionEvent } from "./caseModel";

/** One live investigation: start it (or join a running one), follow its events, and expose the case so far. */
export function useLive(onFinished: () => void) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [question, setQuestion] = useState("");
  const [active, setActive] = useState(false);
  const [startError, setStartError] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [active]);
  useEffect(() => () => stop.current(), []);

  const attach = useCallback((job: string, q: string) => {
    setQuestion(q);
    setActive(true);
    stop.current();
    stop.current = follow(job, (e) => setEvents((xs) => [...xs, e]), () => { setActive(false); onFinished(); });
  }, [onFinished]);

  const start = useCallback(async (q: string) => {
    const text = q.trim();
    setStartError("");
    setEvents([]);
    setQuestion(text);
    setStartedAt(Date.now());
    setNow(Date.now());
    setActive(true);
    try {
      const r = await api.investigate(text);
      if (r.status === 202 && r.job) attach(r.job, text);
      else if (r.status === 409 && r.job) attach(r.job, text);
      else { setActive(false); setStartError(r.error ?? "Could not start the investigation."); }
    } catch (e) {
      setActive(false);
      setStartError(`Could not reach WhyBot: ${(e as Error).message}`);
    }
  }, [attach]);

  const current: Case | null = useMemo(() => {
    if (!events.length) return question && (active || startError) ? (startError ? { ...queuedCase(question), status: "failed", error: startError } : queuedCase(question)) : null;
    const c = buildCase(events);
    // The server can fail before it sends "start"; keep showing the question that was asked.
    return { ...c, question: c.question ?? question };
  }, [events, question, active, startError]);

  const elapsed = startedAt === null ? null : Math.max(0, (now - startedAt) / 1000);
  return { current, start, attach, active, elapsed, question, clear: () => { setEvents([]); setQuestion(""); setStartError(""); } };
}
