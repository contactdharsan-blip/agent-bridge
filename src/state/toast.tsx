// Toast notifications (UI-FR31): transient, self-dismissing feedback so discrete
// actions and failures are never silent and errors never render as emptiness
// (UI-NFR5). Kept in context so any panel can raise one without prop-drilling.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

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
}

const Ctx = createContext<ToastApi | null>(null);
const AUTO_DISMISS_MS = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, text }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return <Ctx.Provider value={{ toasts, push, dismiss }}>{children}</Ctx.Provider>;
}

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used within a ToastProvider");
  return api;
}
