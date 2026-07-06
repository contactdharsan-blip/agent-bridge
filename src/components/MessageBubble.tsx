import { motion } from "framer-motion";
import { FADE } from "../state/motion";
import type { ChatMessage } from "../types";
import { Icon } from "./Icon";

// One bubble renderer for every agent (FR2). `thought` is the agent's reasoning,
// shown dim and labeled so it never masquerades as the answer (UI-FR3); `system`
// is an honest side-note (turn cancelled, edit applied, error). Assistant bubbles
// carry the emitting agent's name — after a handoff the thread contains two
// agents' messages, and which-agent-said-what is this app's whole premise.
const ROLE_LABEL: Record<ChatMessage["role"], string> = {
  user: "you",
  assistant: "agent",
  system: "",
  thought: "thinking",
};

// Entrance animates on mount only — streamed deltas mutate the same message id,
// which never re-mounts (animating per-delta would be pure jank cost).
const entry = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: FADE };

export function MessageBubble({
  message,
  agentName,
}: {
  message: ChatMessage;
  agentName?: (id: string) => string;
}) {
  if (message.role === "thought") {
    return (
      <motion.div className="bubble bubble-thought" {...entry}>
        <span className="bubble-role">
          <Icon name="sparkles" /> {ROLE_LABEL.thought}
        </span>
        <div className="bubble-text">{message.text}</div>
      </motion.div>
    );
  }
  const label =
    message.role === "assistant" && message.agent
      ? (agentName?.(message.agent) ?? message.agent)
      : ROLE_LABEL[message.role];
  return (
    <motion.div className={`bubble bubble-${message.role}`} {...entry}>
      {label && <span className="bubble-role">{label}</span>}
      <div className="bubble-text">{message.text}</div>
    </motion.div>
  );
}
