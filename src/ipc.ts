// The single chokepoint for all Tauri IPC. Nothing else in the UI imports
// `@tauri-apps/api` directly — keeping the rest of the frontend pure and
// trivially testable, and the agent identity entirely Rust-side.

import { invoke, Channel } from "@tauri-apps/api/core";
import type { AgentEvent, AgentInfo, Decision, DoctorReport, SessionId } from "./types";

/** The agents the Rust core knows how to launch (with live auth-presence hints). */
export function listAgents(): Promise<AgentInfo[]> {
  return invoke<AgentInfo[]>("list_agents");
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
  return invoke<SessionId>("start_session", { agentId, cwd, onEvent: channel });
}

/** Send a user prompt to the active session. */
export function sendPrompt(session: SessionId, text: string): Promise<void> {
  return invoke("send_prompt", { session, text });
}

/** Resolve a pending edit/permission request (the accept/reject diff action). */
export function resolvePermission(
  requestId: string,
  decision: Decision,
): Promise<void> {
  return invoke("resolve_permission", { requestId, decision });
}

/** Cancel the in-flight turn for a session. */
export function cancel(session: SessionId): Promise<void> {
  return invoke("cancel", { session });
}

/**
 * Run the local, never-uploaded health check (FR32): Node/npx presence +
 * version, bundled-adapter resolution health, and OS-keychain reachability —
 * so a user (or the solo builder) can quickly see why something isn't working.
 */
export function runDoctor(): Promise<DoctorReport> {
  return invoke<DoctorReport>("run_doctor");
}
