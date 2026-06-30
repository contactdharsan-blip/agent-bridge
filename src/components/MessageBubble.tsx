import type { ChatMessage } from "../types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`bubble bubble-${message.role}`}>
      <span className="bubble-role">{message.role}</span>
      <div className="bubble-text">{message.text}</div>
    </div>
  );
}
