// Toast notifications (UI-FR31): transient, self-dismissing feedback so discrete
// actions and failures are never silent and errors never render as emptiness
// (UI-NFR5). Kept in context so any panel can raise one without prop-drilling.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastApi {
  toasts: Toast[];
  push: (kind: ToastKind, text: string) => void;
  dismiss: (id: number) => void;
  /** Freeze all auto-dismiss countdowns (hover/focus on the stack — WCAG 2.2.1:
   * content the user is reading must not time out under them). */
  pause: () => void;
  resume: () => void;
}

const Ctx = createContext<ToastApi | null>(null);
// Errors linger longer than a success/info confirmation — a failure shouldn't
// vanish as fast as a routine acknowledgement.
const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  success: 4200,
  info: 4200,
  error: 8000,
};
// A burst (e.g. the import wizard reporting per-file) must not wallpaper the
// screen: beyond this, the oldest non-error toast is dropped.
const MAX_VISIBLE = 4;

interface Countdown {
  handle: number;
  deadline: number;
  /** Milliseconds left, captured while paused; null while running. */
  remaining: number | null;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const countdowns = useRef(new Map<number, Countdown>());
  const paused = useRef(false);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      const handle = window.setTimeout(() => {
        countdowns.current.delete(id);
        dismiss(id);
      }, ms);
      countdowns.current.set(id, { handle, deadline: Date.now() + ms, remaining: null });
    },
    [dismiss],
  );

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = nextId.current++;
      setToasts((prev) => {
        const next = [...prev, { id, kind, text }];
        if (next.length <= MAX_VISIBLE) return next;
        const drop = next.findIndex((t) => t.kind !== "error");
        return drop === -1 ? next : next.filter((_, i) => i !== drop);
      });
      if (paused.current) {
        // Arrive already-frozen so hovering the stack doesn't race a new timer.
        countdowns.current.set(id, { handle: 0, deadline: 0, remaining: AUTO_DISMISS_MS[kind] });
      } else {
        schedule(id, AUTO_DISMISS_MS[kind]);
      }
    },
    [schedule],
  );

  const pause = useCallback(() => {
    if (paused.current) return;
    paused.current = true;
    for (const cd of countdowns.current.values()) {
      if (cd.remaining !== null) continue;
      clearTimeout(cd.handle);
      cd.remaining = Math.max(1000, cd.deadline - Date.now());
    }
  }, []);

  const resume = useCallback(() => {
    if (!paused.current) return;
    paused.current = false;
    for (const [id, cd] of countdowns.current) {
      if (cd.remaining === null) continue;
      const ms = cd.remaining;
      countdowns.current.delete(id);
      schedule(id, ms);
    }
  }, [schedule]);

  // Reconcile countdowns with the visible set (manual dismiss, stack-cap drop):
  // done as an effect so the setState updaters stay pure under StrictMode.
  useEffect(() => {
    const alive = new Set(toasts.map((t) => t.id));
    for (const [id, cd] of countdowns.current) {
      if (alive.has(id)) continue;
      clearTimeout(cd.handle);
      countdowns.current.delete(id);
    }
  }, [toasts]);

  return <Ctx.Provider value={{ toasts, push, dismiss, pause, resume }}>{children}</Ctx.Provider>;
}

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used within a ToastProvider");
  return api;
}
