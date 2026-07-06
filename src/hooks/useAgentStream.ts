// The session state machine + streaming hook. Owns the thread, the pending edit,
// turn status, and the rAF-batched text-delta accumulation that keeps React from
// re-rendering on every streamed token.

import { useCallback, useRef, useState } from "react";
import * as ipc from "../ipc";
import { getPreset, loadPresets, resolvePresetDecision } from "../state/permissionPresets";
import type { AgentEvent, ChatMessage, Decision, PendingEdit, SessionId } from "../types";
import { appendToRole, stopNote } from "./streamReducers";

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
  /** End the current session client-side so the picker re-enables and a fresh
   * agent / session can be started (mirrors switchWithBrief's session swap). */
  disconnect: () => void;
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
  // The active session's project dir, so the streaming event handler (below) can
  // look up its permission preset (FR31) without needing cwd threaded through
  // React state — onEvent is only rebuilt on [schedule, flush], not on cwd.
  const cwdRef = useRef<string>("");
  // Same ref pattern for the emitting agent: flush() stamps assistant messages
  // with the agent id so post-handoff threads say which agent said what.
  const agentRef = useRef<string | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const answer = answerBuf.current;
    const thought = thoughtBuf.current;
    answerBuf.current = "";
    thoughtBuf.current = "";
    if (!answer && !thought) return;
    setMessages((prev) => {
      let next = prev;
      if (thought) next = appendToRole(next, thought, "thought", newId);
      if (answer) next = appendToRole(next, answer, "assistant", newId, agentRef.current ?? undefined);
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
        case "editHunk": {
          // Per-project preset (FR31): "acceptEdits" auto-resolves instead of
          // surfacing the diff, but this is never silent — a system message
          // always records what happened, same as every other honesty
          // affordance in this app. Only ever auto-resolves EditHunk (a
          // reviewable file-content diff) — the frozen AgentEvent contract has
          // no other permission-shaped variant to accidentally auto-approve.
          const preset = getPreset(loadPresets(), cwdRef.current);
          if (resolvePresetDecision(preset, "editHunk") === "accept") {
            ipc.resolvePermission(event.requestId, "accept").catch((e) => {
              pushSystem(setMessages, `Failed to auto-apply edit to ${event.path}: ${String(e)}`);
            });
            pushSystem(setMessages, `Auto-applied edit to ${event.path} (acceptEdits preset)`);
          } else {
            setPendingEdit({
              requestId: event.requestId,
              path: event.path,
              oldText: event.oldText,
              newText: event.newText,
            });
          }
          break;
        }
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
      cwdRef.current = cwd;
      agentRef.current = id;
      const sid = await ipc.startSession(id, cwd, onEvent);
      setSession(sid);
      setAgentId(id);
      // A fresh connect starts a fresh thread (a disconnect deliberately keeps
      // the old transcript on screen until this point — see disconnect below).
      setMessages([]);
    },
    [onEvent],
  );

  const prompt = useCallback(
    async (text: string) => {
      if (!session) return;
      setMessages((prev) => [...prev, { id: newId(), role: "user", text }]);
      setTurnActive(true);
      try {
        await ipc.sendPrompt(session, text);
      } catch (e) {
        // Without this, a rejected send left turnActive stuck true forever —
        // composer frozen at "input paused" with no visible cause.
        setTurnActive(false);
        pushSystem(setMessages, `Couldn't send the prompt: ${String(e)}`);
      }
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
      try {
        await ipc.resolvePermission(requestId, decision);
      } catch (e) {
        // The edit was cleared optimistically; without this the user had no way
        // to tell their Accept/Reject never reached the agent (NFR2: report the
        // uncertainty honestly rather than implying it applied).
        pushSystem(
          setMessages,
          `Couldn't deliver your ${decision === "accept" ? "accept" : "reject"} for ${path} — the agent may not have applied it (${String(e)}).`,
        );
        return;
      }
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

  const disconnect = useCallback(() => {
    // Cancel any in-flight turn so the outgoing adapter isn't left running mid-turn,
    // then reset all session-scoped state. Same session-swap shape as switchWithBrief.
    if (session) void ipc.cancel(session).catch(() => {});
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    answerBuf.current = "";
    thoughtBuf.current = "";
    captureRef.current?.reject("Session ended");
    captureRef.current = null;
    cwdRef.current = "";
    agentRef.current = null;
    setSession(null);
    setAgentId(null);
    // Keep the transcript: the app triple-gates overwriting a config file —
    // it shouldn't discard an hour of conversation on one un-confirmed click.
    // An honest system note marks the boundary; the next connect clears it.
    setMessages((prev) =>
      prev.length === 0
        ? prev
        : [...prev, { id: newId(), role: "system", text: "Session ended — thread kept for reference until the next connect." }],
    );
    setPendingEdit(null);
    setTurnActive(false);
    setError(null);
  }, [session]);

  const switchWithBrief = useCallback(
    async (targetAgent: string, cwd: string, brief: string) => {
      setError(null);
      // Drop any unresolved edit from the outgoing agent — its requestId belongs to
      // the abandoned session, so it must not stay actionable against the new one.
      setPendingEdit(null);
      cwdRef.current = cwd;
      agentRef.current = targetAgent;
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
    disconnect,
    switchWithBrief,
  };
}

type SetMessages = React.Dispatch<React.SetStateAction<ChatMessage[]>>;

function pushSystem(setMessages: SetMessages, text: string) {
  setMessages((prev) => [...prev, { id: newId(), role: "system", text }]);
}
