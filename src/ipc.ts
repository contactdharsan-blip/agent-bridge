// The single chokepoint for all Tauri IPC. Nothing else in the UI imports
// `@tauri-apps/api` directly — keeping the rest of the frontend pure and
// trivially testable, and the agent identity entirely Rust-side.

import { invoke, Channel } from "@tauri-apps/api/core";
import type { AgentEvent, AgentInfo, Decision, DoctorReport, SessionId } from "./types";

/**
 * Rejections from `invoke` outside a real Tauri window are a bare
 * `TypeError: Cannot read properties of undefined (reading 'invoke')` — which
 * then leaks verbatim into banners and callouts. Translate exactly that case
 * into an honest, actionable message (keeping the raw detail); every real
 * engine error passes through untouched so callers' parsing (e.g. the
 * AUTH_REQUIRED: prefix) still works.
 */
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const s = e instanceof Error ? e.message : String(e);
    if (s.includes("reading 'invoke'") || s.includes("__TAURI_INTERNALS__")) {
      throw new Error(
        `Desktop engine unreachable — this window isn't running inside the Tauri app, so there is no backend to call. Launch via \`npm run tauri dev\`. (${s})`,
      );
    }
    throw e;
  }
}

/** The agents the Rust core knows how to launch (with live auth-presence hints). */
export function listAgents(): Promise<AgentInfo[]> {
  return tauriInvoke<AgentInfo[]>("list_agents");
}

/**
 * Spawn the chosen agent's adapter and open one session. Streamed events arrive
 * on the provided callback via a Tauri `Channel` (not a return value).
 */
export function startSession(
  agentId: string,
  cwd: string,
  onEvent: (event: AgentEvent) => void,
): Promise<SessionId> {
  const channel = new Channel<AgentEvent>();
  channel.onmessage = onEvent;
  return tauriInvoke<SessionId>("start_session", { agentId, cwd, onEvent: channel });
}

/** Send a user prompt to the active session. */
export function sendPrompt(session: SessionId, text: string): Promise<void> {
  return tauriInvoke("send_prompt", { session, text });
}

/** Resolve a pending edit/permission request (the accept/reject diff action). */
export function resolvePermission(
  requestId: string,
  decision: Decision,
): Promise<void> {
  return tauriInvoke("resolve_permission", { requestId, decision });
}

/** Cancel the in-flight turn for a session. */
export function cancel(session: SessionId): Promise<void> {
  return tauriInvoke("cancel", { session });
}

/**
 * Run the local, never-uploaded health check (FR32): Node/npx presence +
 * version, bundled-adapter resolution health, and OS-keychain reachability —
 * so a user (or the solo builder) can quickly see why something isn't working.
 */
export function runDoctor(): Promise<DoctorReport> {
  return tauriInvoke<DoctorReport>("run_doctor");
}

/**
 * One-click open-native-login (FR47/FR23): open a real terminal in `cwd` so
 * the user can run their agent's own CLI there and complete whatever
 * OAuth/browser step it needs. Never runs the login itself — this app
 * doesn't know each agent's exact login invocation reliably enough to trust
 * auto-executing it (plan §5: "surface each agent's native login flow").
 */
export function openAgentLoginTerminal(cwd: string): Promise<void> {
  return tauriInvoke("open_agent_login_terminal", { cwd });
}
