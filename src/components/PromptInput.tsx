import { useState } from "react";

export function PromptInput({
  disabled,
  pausedReason,
  onSend,
}: {
  disabled: boolean;
  /** Why input is paused — "wait for the agent" and "act on the diff above"
   * are different asks; the generic fallback made the user diagnose which. */
  pausedReason?: string;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="prompt-input">
      <textarea
        value={text}
        disabled={disabled}
        aria-label="Prompt"
        placeholder={
          disabled
            ? (pausedReason ?? "Input paused — finish the current step…")
            : "Ask the agent to do something… (⌘↩ to send)"
        }
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button className="btn btn-send" disabled={disabled} onClick={submit}>
        Send
      </button>
    </div>
  );
}
