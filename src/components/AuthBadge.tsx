import { useState } from "react";
import { agentCli } from "./config/targets";
import { openAgentLoginTerminal } from "../ipc";
import { useToast } from "../state/toast";
import type { AuthStatus } from "../types";
import { Icon, type IconName } from "./Icon";

// Per-agent auth state as an icon+text pill (UI-FR27). Meaning is never carried by
// color alone (UI-NFR6): each state has a distinct glyph and label.
const MAP: Record<AuthStatus, { icon: IconName; label: string; cls: string }> = {
  connected: { icon: "check", label: "API key found", cls: "badge-success" },
  byoLogin: { icon: "info", label: "uses your agent login", cls: "badge-neutral" },
  needsLogin: { icon: "alert", label: "needs login", cls: "badge-warning" },
  error: { icon: "x", label: "error", cls: "badge-error" },
};

export function AuthBadge({
  status,
  env,
  agentId,
  cwd,
}: {
  status: AuthStatus;
  env?: string;
  /** Registry id, needed only for the one-click login action below (FR47). */
  agentId?: string;
  cwd?: string;
}) {
  const m = MAP[status];
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const title =
    status === "connected"
      ? "API key detected in your environment"
      : status === "byoLogin"
        ? "No API key set — Agent Bridge uses your existing sign-in for this agent (subscription/OAuth). No Agent Bridge key needed."
        : status === "needsLogin" && env
          ? `Set ${env} or log in via the agent's own CLI`
          : undefined;

  // One-click open-native-login (FR47/FR23): only offered for the ONE state
  // that means a live connect attempt actually failed for want of auth —
  // byoLogin is the normal, working state for a subscription/OAuth user, so
  // a login prompt there would be misleading, not helpful.
  const cli = agentId ? agentCli(agentId) : undefined;
  const showLogin = status === "needsLogin" && !!cli;

  const openLogin = async () => {
    setOpening(true);
    try {
      await openAgentLoginTerminal(cwd ?? "");
      toast.push("info", cli ? `Opened a terminal — run \`${cli}\` there to sign in` : "Opened a terminal");
    } catch (e) {
      toast.push("error", `Couldn't open a terminal: ${String(e)}`);
    } finally {
      setOpening(false);
    }
  };

  return (
    <span className={`badge ${m.cls}`} title={title}>
      <Icon name={m.icon} />
      {m.label}
      {showLogin && (
        <button
          type="button"
          className="badge-action"
          onClick={openLogin}
          disabled={opening}
          title={`Open a terminal to run \`${cli}\` and sign in`}
        >
          {opening ? "Opening…" : "Sign in"}
        </button>
      )}
    </span>
  );
}
