// The session state machine + streaming hook. Owns the thread, the pending edit,
// turn status, and the rAF-batched text-delta accumulation that keeps React from
// re-rendering on every streamed token.

import { useCallback, useRef, useState } from "react";
import * as ipc from "../ipc";
import type {
  AgentEvent,
  ChatMessage,
  Decision,
  PendingEdit,
  SessionId,
  StopReason,
} from "../types";

let nextId = 1;
const newId = () => nextId++;

/** A capture in flight: the Profile panel runs the skill via `promptCapture` and
 * gets back the completed assistant text (the emitted JSON) to validate. */
interface Capture {
  resolve: (text: string) => void;
  reject: (reason: string) => void;
  buf: string;
}

export interface AgentStream {
  session: SessionId | null;
  agentId: string | null;
  messages: ChatMessage[];
  pendingEdit: PendingEdit | null;
  turnActive: boolean;
  error: string | null;
  connect: (agentId: string, cwd: string) => Promise<void>;
  prompt: (text: string) => Promise<void>;
  /** Send a prompt and resolve with the completed assistant text (UI-FR19). */
  promptCapture: (text: string) => Promise<string>;
  resolve: (decision: Decision) => Promise<void>;
  cancel: () => Promise<void>;
  /** Spawn `targetAgent` and inject a handoff brief as its opening turn, framed as
   * a reconstructed brief — never a resumed session (UI-FR18). */
  switchWithBrief: (targetAgent: string, cwd: string, brief: string) => Promise<void>;
}

export function useAgentStream(): AgentStream {
  const [session, setSession] = useState<SessionId | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [turnActive, setTurnActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // rAF-batched streamed text: deltas accumulate in a ref and flush once per frame.
  // Assistant answer and agent thoughts batch into separate buffers so they land
  // in distinct bubbles (UI-FR3) rather than being folded together.
  const answerBuf = useRef("");
  const thoughtBuf = useRef("");
  const rafRef = useRef<number | null>(null);
  const captureRef = useRef<Capture | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const answer = answerBuf.current;
    const thought = thoughtBuf.current;
    answerBuf.current = "";
    thoughtBuf.current = "";
    if (!answer && !thought) return;
    setMessages((prev) => {
      let next = prev;
      if (thought) next = appendToRole(next, thought, "thought");
      if (answer) next = appendToRole(next, answer, "assistant");
      return next;
    });
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const onEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "textDelta":
          answerBuf.current += event.text;
          if (captureRef.current) captureRef.current.buf += event.text;
          schedule();
          break;
        case "thought":
          thoughtBuf.current += event.text;
          schedule();
          break;
        case "editHunk":
          setPendingEdit({
            requestId: event.requestId,
            path: event.path,
            oldText: event.oldText,
            newText: event.newText,
          });
          break;
        case "turnEnded": {
          flush();
          setTurnActive(false);
          const note = stopNote(event.stopReason);
          if (note) pushSystem(setMessages, note);
          if (captureRef.current) {
            const cap = captureRef.current;
            captureRef.current = null;
            cap.resolve(cap.buf);
          }
          break;
        }
        case "error":
          flush();
          setTurnActive(false);
          setError(event.message);
          pushSystem(setMessages, `Error: ${event.message}`);
          if (captureRef.current) {
            const cap = captureRef.current;
            captureRef.current = null;
            cap.reject(event.message);
          }
          break;
      }
    },
    [schedule, flush],
  );

  const connect = useCallback(
    async (id: string, cwd: string) => {
      setError(null);
      const sid = await ipc.startSession(id, cwd, onEvent);
      setSession(sid);
      setAgentId(id);
    },
    [onEvent],
  );

  const prompt = useCallback(
    async (text: string) => {
      if (!session) return;
      setMessages((prev) => [...prev, { id: newId(), role: "user", text }]);
      setTurnActive(true);
      await ipc.sendPrompt(session, text);
    },
    [session],
  );

  const promptCapture = useCallback(
    (text: string) =>
      new Promise<string>((resolve, reject) => {
        if (!session) {
          reject("No active session");
          return;
        }
        captureRef.current = { resolve, reject, buf: "" };
        setMessages((prev) => [...prev, { id: newId(), role: "user", text }]);
        setTurnActive(true);
        ipc.sendPrompt(session, text).catch((e) => {
          if (captureRef.current) {
            captureRef.current = null;
          }
          setTurnActive(false);
          reject(String(e));
        });
      }),
    [session],
  );

  const resolve = useCallback(
    async (decision: Decision) => {
      if (!pendingEdit) return;
      const { requestId, path } = pendingEdit;
      setPendingEdit(null);
      await ipc.resolvePermission(requestId, decision);
      pushSystem(
        setMessages,
        `${decision === "accept" ? "Applied" : "Rejected"} edit to ${path}`,
      );
    },
    [pendingEdit],
  );

  const cancel = useCallback(async () => {
    if (!session) return;
    await ipc.cancel(session);
    // The adapter should emit turnEnded(cancelled); settle optimistically so the
    // composer re-enables even if the adapter is slow to acknowledge.
    setTurnActive(false);
  }, [session]);

  const switchWithBrief = useCallback(
    async (targetAgent: string, cwd: string, brief: string) => {
      setError(null);
      // Use the fresh session id directly — going through React state would race the
      // send against the not-yet-committed session.
      const sid = await ipc.startSession(targetAgent, cwd, onEvent);
      setSession(sid);
      setAgentId(targetAgent);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "system",
          text: `Switched to ${targetAgent} — carrying a reconstructed brief, not a resumed session.`,
        },
        { id: newId(), role: "user", text: brief },
      ]);
      setTurnActive(true);
      await ipc.sendPrompt(sid, brief);
    },
    [onEvent],
  );

  return {
    session,
    agentId,
    messages,
    pendingEdit,
    turnActive,
    error,
    connect,
    prompt,
    promptCapture,
    resolve,
    cancel,
    switchWithBrief,
  };
}

type SetMessages = React.Dispatch<React.SetStateAction<ChatMessage[]>>;

function pushSystem(setMessages: SetMessages, text: string) {
  setMessages((prev) => [...prev, { id: newId(), role: "system", text }]);
}

/** Append text to the open message of `role`, or start a new one if the last
 * message is a different role. Keeps interleaved thought/answer in own bubbles. */
function appendToRole(
  messages: ChatMessage[],
  chunk: string,
  role: ChatMessage["role"],
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last && last.role === role) {
    const updated = { ...last, text: last.text + chunk };
    return [...messages.slice(0, -1), updated];
  }
  return [...messages, { id: newId(), role, text: chunk }];
}

/** Honest turn-end: every stop reason other than a clean end is surfaced, never
 * silently swallowed (UI-NFR3, UI states matrix). */
function stopNote(sr: StopReason): string | null {
  if (sr === "endTurn") return null;
  if (sr === "cancelled") return "Turn cancelled — output above may be incomplete.";
  if (sr === "maxTokens") return "Turn ended: hit max tokens (response may be truncated).";
  if (sr === "maxTurnRequests") return "Turn ended: hit the max tool-call rounds.";
  if (sr === "refusal") return "Turn ended: the agent declined this request.";
  if (typeof sr === "object" && "other" in sr) return `Turn ended: ${sr.other}.`;
  return null;
}
