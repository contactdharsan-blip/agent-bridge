import { useState } from "react";
import { estimateTokens, formatTokens, TOKEN_ESTIMATE_NOTE } from "../state/tokenEstimate";

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
  const tokens = estimateTokens(text);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="prompt-area">
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
      {/* Upfront cost, before the send: what this prompt roughly costs in
          tokens. Always framed as an estimate — tokenizers differ per agent and
          the response side can't be known in advance (NFR2). */}
      {tokens > 0 && (
        <p className="token-estimate" title={TOKEN_ESTIMATE_NOTE}>
          sends ≈{formatTokens(tokens)} token{tokens === 1 ? "" : "s"} · {TOKEN_ESTIMATE_NOTE}
        </p>
      )}
    </div>
  );
}
