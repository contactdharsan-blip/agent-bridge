import { useEffect, useRef, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { prefersReducedMotion } from "../state/motion";
import type { ChatMessage } from "../types";
import { Icon } from "./Icon";
import { MessageBubble } from "./MessageBubble";

// Pinned only while the reader is at the bottom: scrolling up to read history
// escapes the pin (no rubber-banding against streamed deltas), and this chip is
// the one-click way back down while text is still arriving.
function JumpToLatest() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <button className="thread-jump" onClick={() => void scrollToBottom()}>
      <Icon name="arrowRight" /> Jump to latest
    </button>
  );
}

export function ThreadView({
  messages,
  busy,
  agentName,
}: {
  messages: ChatMessage[];
  busy?: boolean;
  agentName?: (id: string) => string;
}) {
  // Turn-boundary announcements only: a live region over the whole thread would
  // re-announce the mutated last message on every rAF flush and flood screen
  // readers (UI-NFR6).
  const [announce, setAnnounce] = useState("");
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      setAnnounce("");
    } else if (wasBusy.current) {
      wasBusy.current = false;
      setAnnounce("The agent finished responding.");
    }
  }, [busy]);

  const reduced = prefersReducedMotion();
  return (
    <StickToBottom
      className="thread"
      data-tour-step="thread"
      initial={reduced ? "instant" : "smooth"}
      resize={reduced ? "instant" : "smooth"}
    >
      <StickToBottom.Content className="thread-content">
        {messages.length === 0 && (
          <p className="thread-empty">Send a prompt to start the conversation.</p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} agentName={agentName} />
        ))}
        {busy && (
          <div className="thread-busy" aria-hidden="true">
            <span className="pulse-dot" />
            <span className="pulse-dot" />
            <span className="pulse-dot" />
          </div>
        )}
      </StickToBottom.Content>
      <JumpToLatest />
      <span className="sr-only" role="status">
        {announce}
      </span>
    </StickToBottom>
  );
}
