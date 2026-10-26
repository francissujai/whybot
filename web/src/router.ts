import { useCallback, useEffect, useState } from "react";

export type Route = { name: "landing" } | { name: "home" } | { name: "archive" } | { name: "replay"; id: string; speed: number };

export function parseRoute(path: string, hash: string, search: string): Route {
  const m = /^\/replay\/([\dT-]{19})\/?$/.exec(path);
  if (m) return { name: "replay", id: m[1], speed: Number(new URLSearchParams(search).get("speed")) || 10 };
  if (hash === "#archive") return { name: "archive" };
  return path.replace(/\/+$/, "") === "" ? { name: "landing" } : { name: "home" };
}

/** Client-side routing: "/" is the landing page, "/app" the investigation view (plus #archive), "/replay/<run>" a replay. */
export function useRoute(): [Route, (to: string) => void] {
  const read = () => parseRoute(location.pathname, location.hash, location.search);
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("popstate", on);
    window.addEventListener("hashchange", on);
    return () => { window.removeEventListener("popstate", on); window.removeEventListener("hashchange", on); };
  }, []);
  const go = useCallback((to: string) => {
    history.pushState(null, "", to);
    setRoute(read());
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}
