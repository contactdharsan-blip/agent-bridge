// TypeScript mirror of the Rust contract types (crates/acp-host/src/contract.rs).
// These match the serde wire shapes exactly — see the round-trip JSON asserted in
// the Rust tests (e.g. {"type":"editHunk","session":"s","requestId":"r",...}).

export type SessionId = string;
export type Decision = "accept" | "reject";

/** First-class auth state for the per-agent status panel. `byoLogin` = no API
 * key set, but the agent's own native login (subscription/OAuth) is used — not
 * an error. `needsLogin`/`error` are runtime states set after a connect attempt. */
export type AuthStatus = "connected" | "byoLogin" | "needsLogin" | "error";

export interface AgentInfo {
  id: string;
  displayName: string;
  authEnv: string;
  authPresent: boolean;
  authStatus: AuthStatus;
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
