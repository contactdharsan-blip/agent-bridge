import type { ChatMessage } from "../types";
import { Icon } from "./Icon";

// One bubble renderer for every agent (FR2). `thought` is the agent's reasoning,
// shown dim and labeled so it never masquerades as the answer (UI-FR3); `system`
// is an honest side-note (turn cancelled, edit applied, error).
const ROLE_LABEL: Record<ChatMessage["role"], string> = {
  user: "you",
  assistant: "agent",
  system: "",
  thought: "thinking",
};

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "thought") {
    return (
      <div className="bubble bubble-thought">
        <span className="bubble-role">
          <Icon name="sparkles" /> {ROLE_LABEL.thought}
        </span>
        <div className="bubble-text">{message.text}</div>
      </div>
    );
  }
  return (
    <div className={`bubble bubble-${message.role}`}>
      {ROLE_LABEL[message.role] && <span className="bubble-role">{ROLE_LABEL[message.role]}</span>}
      <div className="bubble-text">{message.text}</div>
    </div>
  );
}
