import { useState } from "react";
import { validateProfile } from "../../engines";
import type { CoderProfile } from "../../engineTypes";
import type { AgentStream } from "../../hooks/useAgentStream";
import { load, save } from "../../state/persist";
import { useToast } from "../../state/toast";
import { estimateTokens, formatTokens, TOKEN_ESTIMATE_NOTE } from "../../state/tokenEstimate";
import { agentLabel } from "../config/targets";
import { Icon } from "../Icon";
import { buildProfilePrompt, DEFAULT_PROFILE_DEPTH, extractJson, type ProfileDepth } from "./profileRun";

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

  // FR40: persisted per-machine (not per-project — this is a "how thorough
  // do you want scans in general" preference), defaulting to the cheaper
  // "recent" scan.
  const [depth, setDepth] = useState<ProfileDepth>(() =>
    load<ProfileDepth>("settings.profileDepth", DEFAULT_PROFILE_DEPTH),
  );
  const setDepthPersisted = (d: ProfileDepth) => {
    setDepth(d);
    save("settings.profileDepth", d);
  };
  const prompt = buildProfilePrompt(depth);

  const runInSession = async () => {
    if (!stream.session) return;
    setError(null);
    setReason("other");
    setRunning(true);
    try {
      const text = await stream.promptCapture(prompt);
      const json = extractJson(text);
      if (!json) throw new Error("No JSON object found in the agent's reply.");
      // From here a throw is a validate_profile boundary rejection (schema).
      setReason("schema");
      const profile = await validateProfile(json);
      onAdd(profile);
      toast.push("success", `Validated ${agentLabel(profile.agent)} profile`);
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
      toast.push("success", `Validated ${agentLabel(profile.agent)} profile`);
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
        <div className="profile-run-row">
          {/* FR40: recent (default, cheaper) vs deep scan — a real, larger
              agent-side token cost the app can't meter, so it's an explicit
              opt-in shown right next to the run action, not a hidden setting. */}
          <div className="target-selector" role="group" aria-label="Scan depth">
            <button
              type="button"
              aria-current={depth === "recent" ? "true" : undefined}
              className={`seg ${depth === "recent" ? "seg-active" : ""}`}
              disabled={running}
              onClick={() => setDepthPersisted("recent")}
            >
              Recent
            </button>
            <button
              type="button"
              aria-current={depth === "deep" ? "true" : undefined}
              className={`seg ${depth === "deep" ? "seg-active" : ""}`}
              disabled={running}
              onClick={() => setDepthPersisted("deep")}
              title="Asks the agent to read as much local history as it can find, not just a recent window — real, larger cost on the agent's side."
            >
              Deep scan
            </button>
          </div>
          <button className="btn btn-sm btn-primary" onClick={runInSession} disabled={running || stream.turnActive}>
            <Icon name="sparkles" />{" "}
            {running ? "Running in session…" : `Run profile in ${agentLabel(stream.agentId ?? "")}`}
          </button>
          {running && (
            <>
              <button className="btn btn-sm btn-ghost" onClick={() => void stream.cancel()}>
                <Icon name="stop" /> Cancel
              </button>
              <span className="card-sub">Streams live in the Run tab.</span>
            </>
          )}
          {/* Upfront cost: the invoking prompt is small and known, but the
              skill then reads local history *inside* the session — the agent's
              own usage scales with that history and can't be known here. Say
              both, don't imply the small number is the whole cost. Deep scan
              gets its own, blunter warning since its whole point is reading
              MORE, not a nuance worth burying in the same line as recent. */}
          {!running && (
            <p className="token-estimate" title={TOKEN_ESTIMATE_NOTE}>
              sends ≈{formatTokens(estimateTokens(prompt))} prompt tokens · {TOKEN_ESTIMATE_NOTE}; the
              skill then reads local history in-session, so the agent's own usage will be larger
              {depth === "deep" ? " — deep scan asks for ALL available history, so expect meaningfully more" : ""}
            </p>
          )}
        </div>
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
                <Icon name="check" /> {agentLabel(p.agent)}
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
