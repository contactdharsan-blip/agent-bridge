import { AnimatePresence, motion } from "framer-motion";
import { useToast, type ToastKind } from "../state/toast";
import { Icon, type IconName } from "./Icon";

// The toast stack renderer. Meaning is icon + text, never color alone (UI-NFR6).
const ICON: Record<ToastKind, IconName> = {
  success: "check",
  error: "x",
  info: "info",
};

export function Toasts() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="toast-stack">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
            className={`toast toast-${t.kind}`}
            role={t.kind === "error" ? "alert" : "status"}
          >
            <Icon name={ICON[t.kind]} />
            <span className="toast-text">{t.text}</span>
            <button
              className="toast-close"
              aria-label="dismiss"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="x" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
