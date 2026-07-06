import { useState } from "react";
import { validateProfile } from "../../engines";
import type { CoderProfile } from "../../engineTypes";
import type { AgentStream } from "../../hooks/useAgentStream";
import { useToast } from "../../state/toast";
import { Icon } from "../Icon";
import { extractJson, PROFILE_PROMPT } from "./profileRun";

// Collect up to three per-agent profiles (UI-FR19/20). Two honest paths, both
// funneled through validate_profile so non-conforming JSON is rejected at the
// boundary and can never enter the merge: run the skill in the live session, or
// paste JSON emitted from an agent you ran it in manually.
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function ProfileCollector({
  stream,
  collected,
  onAdd,
  onRemove,
}: {
  stream: AgentStream;
  collected: CoderProfile[];
  onAdd: (profile: CoderProfile) => void;
  onRemove: (agent: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether `error` is a validate_profile boundary rejection (schema) or some
  // other failure (transport/IPC, or no JSON in the reply) — so the banner only
  // claims "schema failure, not fabricated" when that's actually true.
  const [reason, setReason] = useState<"schema" | "other">("other");
  const [paste, setPaste] = useState("");
  const toast = useToast();

  const runInSession = async () => {
    if (!stream.session) return;
    setError(null);
    setReason("other");
    setRunning(true);
    try {
      const text = await stream.promptCapture(PROFILE_PROMPT);
      const json = extractJson(text);
      if (!json) throw new Error("No JSON object found in the agent's reply.");
      // From here a throw is a validate_profile boundary rejection (schema).
      setReason("schema");
      const profile = await validateProfile(json);
      onAdd(profile);
      toast.push("success", `Validated ${profile.agent} profile`);
    } catch (e) {
      setError(String(e));
      toast.push("error", "Profile rejected at the boundary");
    } finally {
      setRunning(false);
    }
  };

  const [validating, setValidating] = useState(false);
  const validatePaste = async () => {
    setError(null);
    setReason("schema"); // this path can only fail inside validate_profile
    setValidating(true);
    try {
      const profile = await validateProfile(paste);
      onAdd(profile);
      setPaste("");
      toast.push("success", `Validated ${profile.agent} profile`);
    } catch (e) {
      setError(String(e));
      toast.push("error", "Profile rejected at the boundary");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="glass-card profile-collector">
      <h3 className="card-title">
        <Icon name="user" /> Collect per-agent profiles
      </h3>
      <p className="card-sub">
        The skill runs on each agent's own model over its local history — only the aggregate JSON
        leaves the session. Nothing raw is uploaded.
      </p>

      {stream.session ? (
        <button className="btn btn-sm btn-primary" onClick={runInSession} disabled={running || stream.turnActive}>
          <Icon name="sparkles" /> {running ? "Running in session…" : `Run profile in ${stream.agentId}`}
        </button>
      ) : (
        <div className="callout">
          <Icon name="info" /> Connect an agent in the Run tab to profile it live, or paste its JSON
          below.
        </div>
      )}

      <div className="snap-field">
        <div className="snap-field-head">
          <span>Or paste a CoderProfile JSON</span>
        </div>
        <textarea
          className="ondisk-input"
          rows={3}
          aria-label="Paste a CoderProfile JSON"
          placeholder='{ "schemaVersion": 1, "agent": "claude", ... }'
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <button className="btn btn-sm" onClick={validatePaste} disabled={!paste.trim() || validating}>
          <Icon name="shield" /> {validating ? "Validating…" : "Validate & add"}
        </button>
      </div>

      {error && (
        <div className="callout callout-error">
          <Icon name="x" />{" "}
          {reason === "schema"
            ? "Rejected at the boundary (schema failure, not a fabricated profile): "
            : "Couldn't add profile: "}
          {error}
        </div>
      )}

      {collected.length > 0 && (
        <ul className="collected-list">
          {collected.map((p) => (
            <li key={p.agent} className="collected-item">
              <span className="badge badge-accent">
                <Icon name="check" /> {p.agent}
              </span>
              <span className="collected-vol">
                {plural(p.data.messagesAnalyzed, "msg")} · {plural(p.data.sessionsAnalyzed, "session")}{" "}
                · {p.data.daysCovered}d
              </span>
              <button
                className="btn btn-sm btn-ghost icon-btn"
                aria-label={`remove ${p.agent} profile`}
                onClick={() => onRemove(p.agent)}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
