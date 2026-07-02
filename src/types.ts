// TypeScript mirror of the Rust contract types (crates/acp-host/src/contract.rs).
// These match the serde wire shapes exactly — see the round-trip JSON asserted in
// the Rust tests (e.g. {"type":"editHunk","session":"s","requestId":"r",...}).

export type SessionId = string;
export type Decision = "accept" | "reject";

/** First-class auth state for the per-agent status panel. */
export type AuthStatus = "connected" | "needsLogin" | "error";

export interface AgentInfo {
  id: string;
  displayName: string;
  authEnv: string;
  authPresent: boolean;
  authStatus: AuthStatus;
}

// ---- Doctor diagnostics (src-tauri/src/doctor.rs, FR32) --------------------
// Local, never-uploaded health check: Node/npx presence+version, bundled-
// adapter resolution health, and OS-keychain reachability.

/** One agent's resolved adapter command + auth status, from the same registry
 * `list_agents`/`start_session` already use — never reimplemented in the UI. */
export interface AgentDoctorEntry {
  id: string;
  displayName: string;
  resolvedCommand: string;
  resolvedArgs: string[];
  authStatus: AuthStatus;
}

/** `Result<bool, String>` as it crosses the IPC boundary: serde's builtin,
 * externally-tagged `Result` shape (`{ Ok: T }` / `{ Err: E }`) — capitalized
 * because it's the standard library's own impl, not one of our
 * `#[serde(rename_all = "camelCase")]` types. */
export type KeychainProbe = { Ok: boolean } | { Err: string };

export interface DoctorReport {
  nodeVersion: string | null;
  npxVersion: string | null;
  agents: AgentDoctorEntry[];
  keychain: KeychainProbe;
}

/** A stop reason is a camelCase tag, or `{ other: "..." }` for unknown ones. */
export type StopReason =
  | "endTurn"
  | "maxTokens"
  | "maxTurnRequests"
  | "refusal"
  | "cancelled"
  | { other: string };

/** The one message model the UI renders, for every agent. */
export type AgentEvent =
  | { type: "textDelta"; session: SessionId; text: string }
  | { type: "thought"; session: SessionId; text: string }
  | {
      type: "editHunk";
      session: SessionId;
      requestId: string;
      path: string;
      oldText: string | null;
      newText: string;
    }
  | { type: "turnEnded"; session: SessionId; stopReason: StopReason }
  | {
      type: "error";
      session: SessionId | null;
      kind: string;
      message: string;
    };

/** A rendered chat message in the unified thread. `thought` is the agent's
 * reasoning, rendered distinctly from its answer (UI-FR3). */
export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system" | "thought";
  text: string;
}

/** A pending edit awaiting the user's accept/reject. */
export interface PendingEdit {
  requestId: string;
  path: string;
  oldText: string | null;
  newText: string;
}
