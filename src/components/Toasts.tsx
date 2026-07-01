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
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <Icon name={ICON[t.kind]} />
          <span className="toast-text">{t.text}</span>
          <button
            className="toast-close"
            aria-label="dismiss"
            onClick={() => dismiss(t.id)}
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}
