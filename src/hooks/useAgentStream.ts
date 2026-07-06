// The session state machine + streaming hook. Owns the thread, the pending edit,
// turn status, and the rAF-batched text-delta accumulation that keeps React from
// re-rendering on every streamed token.

import { useCallback, useRef, useState } from "react";
import * as ipc from "../ipc";
import { getPreset, loadPresets, resolvePresetDecision } from "../state/permissionPresets";
import type { AgentEvent, ChatMessage, Decision, PendingEdit, PendingPermission, SessionId } from "../types";
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
  /** A non-diff permission ask (e.g. a shell-command approval) awaiting
   * accept/reject — UI-FR06's generic counterpart to `pendingEdit`. */
  pendingPermission: PendingPermission | null;
  turnActive: boolean;
  error: string | null;
  connect: (agentId: string, cwd: string) => Promise<void>;
  prompt: (text: string) => Promise<void>;
  /** Send a prompt and resolve with the completed assistant text (UI-FR19). */
  promptCapture: (text: string) => Promise<string>;
  resolve: (decision: Decision) => Promise<void>;
  /** Resolve a pending non-diff permission ask (`pendingPermission`). */
  resolvePermissionRequest: (decision: Decision) => Promise<void>;
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
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
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
  // Session epoch: each connect/switch/disconnect bumps it, and every session's
  // event channel is wrapped with the epoch it was opened under. Events from a
  // superseded session (an old adapter still streaming after a switch — the
  // backend keeps it alive until replaced) are DROPPED at the door instead of
  // bleeding into the new thread stamped with the new agent's name, unlocking
  // the composer mid-turn, or resurfacing a dead session's edit request.
  const epochRef = useRef(0);
  // Turn-disowned flag: set by cancel(), cleared by the real TurnEnded (or a
  // fresh connect/disconnect/switch). ACP cancellation is cooperative — the
  // agent may keep streaming for a while (or ignore cancellation entirely)
  // after we ask it to stop. Reusing `epochRef` for this would be wrong: its
  // value is captured once per connect() and baked into that session's event
  // channel forever, so bumping it on cancel would also silently drop every
  // later turn's events in the SAME still-open session. This flag is scoped
  // to "is the CURRENT turn disowned", not "is this the current session".
  const turnDisownedRef = useRef(false);

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
          if (turnDisownedRef.current) break;
          answerBuf.current += event.text;
          if (captureRef.current) captureRef.current.buf += event.text;
          schedule();
          break;
        case "thought":
          if (turnDisownedRef.current) break;
          thoughtBuf.current += event.text;
          schedule();
          break;
        case "editHunk": {
          if (turnDisownedRef.current) {
            // A cooperative cancel doesn't guarantee the adapter stops
            // immediately — it may still ask for a permission before
            // honoring session/cancel. Auto-reject rather than resurfacing a
            // diff for a turn the user already disowned, and rather than
            // silently leaving the agent's request unresolved (which would
            // hang its dispatch loop waiting for a decision that never comes).
            ipc.resolvePermission(event.requestId, "reject").catch(() => {});
            pushSystem(setMessages, `Auto-rejected an edit to ${event.path} that arrived after cancel`);
            break;
          }
          // Per-project preset (FR31): "acceptEdits" auto-resolves instead of
          // surfacing the diff, but this is never silent — a system message
          // always records what happened, same as every other honesty
          // affordance in this app. Deliberately scoped to EditHunk (a
          // reviewable file-content diff) only — a generic PermissionRequest
          // (e.g. a shell-command approval) always surfaces below, even under
          // this preset, so "acceptEdits" can't silently widen into "run
          // anything" the moment a second permission-shaped event exists.
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
        case "permissionRequest": {
          if (turnDisownedRef.current) {
            ipc.resolvePermission(event.requestId, "reject").catch(() => {});
            pushSystem(setMessages, `Auto-rejected a request ("${event.description}") that arrived after cancel`);
            break;
          }
          // Always surfaced for manual approve/deny — never auto-resolved by
          // the acceptEdits preset (see the comment above editHunk's preset
          // check): this can be an arbitrary action (e.g. running a shell
          // command), not a reviewable file diff.
          setPendingPermission({ requestId: event.requestId, description: event.description });
          break;
        }
        case "turnEnded": {
          turnDisownedRef.current = false;
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

  /** Wrap the event callback with the epoch it was opened under — a superseded
   * session's channel keeps delivering, and its events must not act on the
   * current session's state. */
  const gatedOnEvent = useCallback(
    (epoch: number) => (event: AgentEvent) => {
      if (epochRef.current !== epoch) return;
      onEvent(event);
    },
    [onEvent],
  );

  const connect = useCallback(
    async (id: string, cwd: string) => {
      setError(null);
      cwdRef.current = cwd;
      agentRef.current = id;
      turnDisownedRef.current = false;
      const epoch = ++epochRef.current;
      const sid = await ipc.startSession(id, cwd, gatedOnEvent(epoch));
      setSession(sid);
      setAgentId(id);
      // A fresh connect starts a fresh thread (a disconnect deliberately keeps
      // the old transcript on screen until this point — see disconnect below).
      setMessages([]);
    },
    [gatedOnEvent],
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
        const cap: Capture = { resolve, reject, buf: "" };
        captureRef.current = cap;
        setMessages((prev) => [...prev, { id: newId(), role: "user", text }]);
        setTurnActive(true);
        ipc.sendPrompt(session, text).catch((e) => {
          // Only unwind if OUR capture is still the registered one — a slow
          // adapter's late rejection must not orphan a newer session's capture
          // or unlock the composer mid-new-turn.
          if (captureRef.current === cap) {
            captureRef.current = null;
            setTurnActive(false);
          }
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

  const resolvePermissionRequest = useCallback(
    async (decision: Decision) => {
      if (!pendingPermission) return;
      const { requestId, description } = pendingPermission;
      setPendingPermission(null);
      try {
        await ipc.resolvePermission(requestId, decision);
      } catch (e) {
        pushSystem(
          setMessages,
          `Couldn't deliver your ${decision === "accept" ? "approve" : "deny"} for "${description}" — the agent may not have applied it (${String(e)}).`,
        );
        return;
      }
      pushSystem(
        setMessages,
        `${decision === "accept" ? "Approved" : "Denied"}: ${description}`,
      );
    },
    [pendingPermission],
  );

  const cancel = useCallback(async () => {
    if (!session) return;
    // Disown the turn BEFORE the IPC call so nothing racing in from the
    // still-open channel between now and the real TurnEnded gets appended
    // (see `turnDisownedRef` above) — and so a capture in flight (the Profile
    // panel's promptCapture) doesn't get resolved with a truncated buffer.
    turnDisownedRef.current = true;
    if (captureRef.current) {
      captureRef.current.reject("Cancelled");
      captureRef.current = null;
    }
    try {
      await ipc.cancel(session);
    } catch (e) {
      // The cancel call itself failed to reach the backend — don't keep
      // suppressing output for a turn we never actually asked to stop.
      turnDisownedRef.current = false;
      pushSystem(setMessages, `Couldn't cancel: ${String(e)}`);
      return;
    }
    // Don't optimistically flip turnActive: the backend now actually delivers
    // `session/cancel` to the agent, so the real TurnEnded (Cancelled, or
    // whatever the agent honors) is what settles it honestly instead.
  }, [session]);

  const disconnect = useCallback(() => {
    // Cancel any in-flight turn so the outgoing adapter isn't left running mid-turn,
    // then reset all session-scoped state. Same session-swap shape as switchWithBrief.
    // The epoch bump gates out anything the old channel still delivers — the
    // backend keeps the old host alive until the next connect replaces it.
    epochRef.current += 1;
    turnDisownedRef.current = false;
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
    setPendingPermission(null);
    setTurnActive(false);
    setError(null);
  }, [session]);

  const switchWithBrief = useCallback(
    async (targetAgent: string, cwd: string, brief: string) => {
      setError(null);
      // Drop any unresolved edit/permission from the outgoing agent — its
      // requestId belongs to the abandoned session, so it must not stay
      // actionable against the new one.
      setPendingEdit(null);
      setPendingPermission(null);
      // Retire the outgoing session BEFORE the new agent id is stamped: cancel
      // its in-flight turn, drop any half-flushed buffered text (it belongs to
      // the old agent and would otherwise flush into the new thread under the
      // new agent's name), and settle any pending capture honestly.
      if (session) void ipc.cancel(session).catch(() => {});
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      answerBuf.current = "";
      thoughtBuf.current = "";
      captureRef.current?.reject("Session ended by handoff switch");
      captureRef.current = null;
      turnDisownedRef.current = false;
      cwdRef.current = cwd;
      agentRef.current = targetAgent;
      const epoch = ++epochRef.current;
      // Use the fresh session id directly — going through React state would race the
      // send against the not-yet-committed session.
      let sid: SessionId;
      try {
        sid = await ipc.startSession(targetAgent, cwd, gatedOnEvent(epoch));
      } catch (e) {
        // The outgoing session was already retired above — don't keep showing
        // it as live. Same end-state as disconnect; the error still travels up
        // so the panel reports the failed handoff.
        setSession(null);
        setAgentId(null);
        setTurnActive(false);
        pushSystem(
          setMessages,
          "Handoff failed — the previous session was ended when the switch began. Connect again from the header.",
        );
        throw e;
      }
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
      try {
        await ipc.sendPrompt(sid, brief);
      } catch (e) {
        // The session opened but the brief never arrived — say so instead of
        // leaving a "sent" bubble implying delivery and a composer frozen at
        // "the agent is responding" (same class as prompt()'s catch).
        setTurnActive(false);
        pushSystem(
          setMessages,
          `Couldn't deliver the brief to ${targetAgent}: ${String(e)} — the new session is open; resend from the composer.`,
        );
      }
    },
    [session, gatedOnEvent],
  );

  return {
    session,
    agentId,
    messages,
    pendingEdit,
    pendingPermission,
    turnActive,
    error,
    connect,
    prompt,
    promptCapture,
    resolve,
    resolvePermissionRequest,
    cancel,
    disconnect,
    switchWithBrief,
  };
}

type SetMessages = React.Dispatch<React.SetStateAction<ChatMessage[]>>;

function pushSystem(setMessages: SetMessages, text: string) {
  setMessages((prev) => [...prev, { id: newId(), role: "system", text }]);
}
