import type { AgentInfo } from "../types";

// The ONE piece of UI M2 adds. It lists whatever agents the Rust registry
// reports — it does not know or branch on which agents exist.
export function AgentPicker({
  agents,
  selected,
  cwd,
  disabled,
  onSelect,
  onCwdChange,
  onConnect,
}: {
  agents: AgentInfo[];
  selected: string;
  cwd: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onCwdChange: (cwd: string) => void;
  onConnect: () => void;
}) {
  const current = agents.find((a) => a.id === selected);

  return (
    <div className="agent-picker">
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
      {current && (
        <span className={`auth-status ${current.authPresent ? "ok" : "missing"}`}>
          {current.authPresent ? "connected" : `set ${current.authEnv}`}
        </span>
      )}
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
      <button className="btn btn-connect" disabled={disabled || !cwd.trim()} onClick={onConnect}>
        Connect
      </button>
    </div>
  );
}
