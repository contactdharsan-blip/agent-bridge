import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";
import { MessageBubble } from "./MessageBubble";

export function ThreadView({ messages, busy }: { messages: ChatMessage[]; busy?: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as text streams in — but honor reduced-motion,
  // since this fires on every streamed delta (UI-NFR6).
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }, [messages, busy]);

  return (
    // aria-live=polite: streamed deltas are announced to screen readers without
    // flooding on every token (UI-NFR6).
    <div className="thread" data-tour-step="thread" aria-live="polite">
      {messages.length === 0 && (
        <p className="thread-empty">Send a prompt to start the conversation.</p>
      )}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {busy && (
        <div className="thread-busy" aria-hidden="true">
          <span className="pulse-dot" />
          <span className="pulse-dot" />
          <span className="pulse-dot" />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
