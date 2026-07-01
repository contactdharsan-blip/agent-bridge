import type { AgentInfo } from "../types";
import { AuthBadge } from "./AuthBadge";
import { Icon } from "./Icon";

// The agent surface: a live status strip for every registered agent (UI-FR27) plus
// the connect control. It lists whatever the Rust registry reports and never
// branches on which agents exist — adding an agent is a registry row, not UI code.
export function AgentPicker({
  agents,
  selected,
  cwd,
  disabled,
  connecting,
  onSelect,
  onCwdChange,
  onConnect,
}: {
  agents: AgentInfo[];
  selected: string;
  cwd: string;
  disabled: boolean;
  connecting: boolean;
  onSelect: (id: string) => void;
  onCwdChange: (cwd: string) => void;
  onConnect: () => void;
}) {
  const current = agents.find((a) => a.id === selected);
  // Never let a session start against an agent the core reports as errored (US-E1.4).
  const blocked = current?.authStatus === "error";

  return (
    <div className="agent-surface">
      <div className="agent-status-strip">
        {agents.map((a) => (
          <span key={a.id} className="agent-chip">
            <Icon name="cpu" />
            <span className="agent-chip-name">{a.displayName}</span>
            <AuthBadge status={a.authStatus} env={a.authEnv} />
          </span>
        ))}
      </div>

      <div className="agent-connect">
        <label>
          Agent
          <select value={selected} disabled={disabled} onChange={(e) => onSelect(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="cwd-field">
          Working dir
          <input
            type="text"
            value={cwd}
            disabled={disabled}
            placeholder="/path/to/project"
            onChange={(e) => onCwdChange(e.target.value)}
          />
        </label>
        <button
          className="btn btn-primary btn-connect"
          disabled={disabled || blocked || !cwd.trim()}
          onClick={onConnect}
          title={blocked ? "This agent reports an error — resolve it before connecting" : undefined}
        >
          {connecting ? (
            <>
              <Icon name="refresh" /> Connecting…
            </>
          ) : (
            <>
              <Icon name="cpu" /> Connect
            </>
          )}
        </button>
      </div>
      {blocked && (
        <p className="agent-blocked-note">
          <Icon name="alert" /> {current?.displayName} reports an error and can't start a session
          until it clears.
        </p>
      )}
    </div>
  );
}
