// Pure reducers extracted from useAgentStream so they can be unit-tested in
// isolation (§12) — no React, no transport, input in / value out.

import type { ChatMessage, StopReason } from "../types";

/** Append text to the open message of `role`, or start a new one (via `mkId`) if
 * the last message is a different role. Keeps interleaved thought/answer in their
 * own bubbles. */
export function appendToRole(
  messages: ChatMessage[],
  chunk: string,
  role: ChatMessage["role"],
  mkId: () => number,
  agent?: string,
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last && last.role === role) {
    const updated = { ...last, text: last.text + chunk };
    return [...messages.slice(0, -1), updated];
  }
  return [...messages, { id: mkId(), role, text: chunk, ...(agent ? { agent } : {}) }];
}

/** Honest turn-end: every stop reason other than a clean end maps to a note that
 * is surfaced in-thread, never silently swallowed (UI-NFR3). */
export function stopNote(sr: StopReason): string | null {
  if (sr === "endTurn") return null;
  if (sr === "cancelled") return "Turn cancelled — output above may be incomplete.";
  if (sr === "maxTokens") return "Turn ended: hit max tokens (response may be truncated).";
  if (sr === "maxTurnRequests") return "Turn ended: hit the max tool-call rounds.";
  if (sr === "refusal") return "Turn ended: the agent declined this request.";
  if (typeof sr === "object" && "other" in sr) return `Turn ended: ${sr.other}.`;
  return null;
}
