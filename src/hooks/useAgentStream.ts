// The session state machine + streaming hook. Owns the thread, the pending edit,
// turn status, and the rAF-batched text-delta accumulation that keeps React from
// re-rendering on every streamed token.

import { useCallback, useRef, useState } from "react";
import * as ipc from "../ipc";
import type { AgentEvent, ChatMessage, Decision, PendingEdit, SessionId } from "../types";

let nextId = 1;
const newId = () => nextId++;

export interface AgentStream {
  session: SessionId | null;
  messages: ChatMessage[];
  pendingEdit: PendingEdit | null;
  turnActive: boolean;
  error: string | null;
  connect: (agentId: string, cwd: string) => Promise<void>;
  prompt: (text: string) => Promise<void>;
  resolve: (decision: Decision) => Promise<void>;
}

export function useAgentStream(): AgentStream {
  const [session, setSession] = useState<SessionId | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [turnActive, setTurnActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // rAF-batched assistant text: deltas accumulate in a ref and flush once per frame.
  const bufRef = useRef("");
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const chunk = bufRef.current;
    bufRef.current = "";
    if (!chunk) return;
    setMessages((prev) => appendToAssistant(prev, chunk));
  }, []);

  const onTextDelta = useCallback(
    (text: string) => {
      bufRef.current += text;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  const onEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "textDelta":
          onTextDelta(event.text);
          break;
        case "thought":
          // M1 renders thoughts inline with the same batching as text.
          onTextDelta(event.text);
          break;
        case "editHunk":
          setPendingEdit({
            requestId: event.requestId,
            path: event.path,
            oldText: event.oldText,
            newText: event.newText,
          });
          break;
        case "turnEnded":
          flush();
          setTurnActive(false);
          break;
        case "error":
          flush();
          setTurnActive(false);
          setError(event.message);
          setMessages((prev) => [
            ...prev,
            { id: newId(), role: "system", text: `Error: ${event.message}` },
          ]);
          break;
      }
    },
    [onTextDelta, flush],
  );

  const connect = useCallback(
    async (agentId: string, cwd: string) => {
      setError(null);
      const sid = await ipc.startSession(agentId, cwd, onEvent);
      setSession(sid);
    },
    [onEvent],
  );

  const prompt = useCallback(
    async (text: string) => {
      if (!session) return;
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text },
        { id: newId(), role: "assistant", text: "" },
      ]);
      setTurnActive(true);
      await ipc.sendPrompt(session, text);
    },
    [session],
  );

  const resolve = useCallback(
    async (decision: Decision) => {
      if (!pendingEdit) return;
      const { requestId, path } = pendingEdit;
      setPendingEdit(null);
      await ipc.resolvePermission(requestId, decision);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "system",
          text: `${decision === "accept" ? "Applied" : "Rejected"} edit to ${path}`,
        },
      ]);
    },
    [pendingEdit],
  );

  return { session, messages, pendingEdit, turnActive, error, connect, prompt, resolve };
}

/** Append text to the open assistant message, or start one if none is open. */
function appendToAssistant(messages: ChatMessage[], chunk: string): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") {
    const updated = { ...last, text: last.text + chunk };
    return [...messages.slice(0, -1), updated];
  }
  return [...messages, { id: newId(), role: "assistant", text: chunk }];
}
