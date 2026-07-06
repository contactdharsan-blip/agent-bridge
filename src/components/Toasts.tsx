import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useToast, type ToastKind } from "../state/toast";
import { Icon, type IconName } from "./Icon";

// The toast stack renderer. Meaning is icon + text, never color alone (UI-NFR6).
const ICON: Record<ToastKind, IconName> = {
  success: "check",
  error: "x",
  info: "info",
};

export function Toasts() {
  const { toasts, dismiss, pause, resume } = useToast();
  // Hover/focus freezes every countdown — a toast being read never times out
  // under the reader (WCAG 2.2.1). Both signals are tracked (not one-shot
  // enter/leave events alone) because dismissing a focused toast removes the
  // element WITHOUT firing blur — the reconcile effect below re-derives focus
  // from the live DOM so a keyboard dismiss can't latch the pause forever.
  const stackRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const sync = () => {
    if (hovered.current || focused.current) pause();
    else resume();
  };

  useEffect(() => {
    if (focused.current && !stackRef.current?.contains(document.activeElement)) {
      focused.current = false;
      sync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts]);

  return (
    // popLayout: an exiting toast leaves layout flow at once so the survivors
    // spring up smoothly instead of jumping after the exit.
    <div
      ref={stackRef}
      className="toast-stack"
      onMouseEnter={() => {
        hovered.current = true;
        sync();
      }}
      onMouseLeave={() => {
        hovered.current = false;
        sync();
      }}
      onFocusCapture={() => {
        focused.current = true;
        sync();
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          focused.current = false;
          sync();
        }
      }}
    >
      <AnimatePresence mode="popLayout">
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
