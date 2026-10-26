import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { FADE } from "./motion";

interface Toast { id: number; msg: string; ok: boolean }
const Ctx = createContext<(msg: string, ok?: boolean) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((msg: string, ok = true) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, msg, ok }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ok ? 5000 : 9000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <m.div key={t.id} className={`toast ${t.ok ? "" : "err"}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={FADE}>
              <span>{t.msg}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss">×</button>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
