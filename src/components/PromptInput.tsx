import { useState } from "react";

export function PromptInput({
  disabled,
  onSend,
}: {
  disabled: boolean;
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
        placeholder={disabled ? "Waiting for the agent…" : "Ask the agent to do something…"}
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
