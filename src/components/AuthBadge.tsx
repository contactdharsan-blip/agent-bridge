import type { AuthStatus } from "../types";
import { Icon, type IconName } from "./Icon";

// Per-agent auth state as an icon+text pill (UI-FR27). Meaning is never carried by
// color alone (UI-NFR6): each state has a distinct glyph and label.
const MAP: Record<AuthStatus, { icon: IconName; label: string; cls: string }> = {
  connected: { icon: "check", label: "connected", cls: "badge-success" },
  needsLogin: { icon: "alert", label: "needs login", cls: "badge-warning" },
  error: { icon: "x", label: "error", cls: "badge-error" },
};

export function AuthBadge({ status, env }: { status: AuthStatus; env?: string }) {
  const m = MAP[status];
  const title =
    status === "needsLogin" && env ? `Set ${env} or log in via the agent's own CLI` : undefined;
  return (
    <span className={`badge ${m.cls}`} title={title}>
      <Icon name={m.icon} />
      {m.label}
    </span>
  );
}
