import { motion } from "framer-motion";
import { useState } from "react";
import type { PermissionPreset } from "../state/permissionPresets";
import type { AgentInfo } from "../types";
import { AuthBadge } from "./AuthBadge";
import { Icon } from "./Icon";
import { PermissionPresetSelector } from "./PermissionPresetSelector";

// The agent surface: a live status strip for every registered agent (UI-FR27) plus
// the connect control. It lists whatever the Rust registry reports and never
// branches on which agents exist — adding an agent is a registry row, not UI code.
export function AgentPicker({
  agents,
  selected,
  cwd,
  disabled,
  connecting,
  connected,
  preset,
  onSelect,
  onCwdChange,
  onConnect,
  onDisconnect,
  onRecheck,
  onPresetChange,
}: {
  agents: AgentInfo[];
  selected: string;
  cwd: string;
  disabled: boolean;
  connecting: boolean;
  connected: boolean;
  preset: PermissionPreset;
  onSelect: (id: string) => void;
  onCwdChange: (cwd: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRecheck: () => Promise<void>;
  onPresetChange: (preset: PermissionPreset) => void;
}) {
  const current = agents.find((a) => a.id === selected);
  // Never let a session start against an agent the core reports as errored (US-E1.4).
  const blocked = current?.authStatus === "error";
  // No API key set — not a blocker: the agent's own login (subscription/OAuth)
  // is used. Connect stays enabled; a failed connect is the real verdict.
  const byoLogin = current?.authStatus === "byoLogin";
  const [rechecking, setRechecking] = useState(false);
  const recheck = async () => {
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div className="agent-surface" data-tour-step="agent-picker">
      <div className="agent-status-strip">
        {agents.map((a) => (
          <span key={a.id} className="agent-chip">
            <Icon name="cpu" />
            <span className="agent-chip-name">{a.displayName}</span>
            <AuthBadge status={a.authStatus} env={a.authEnv} />
          </span>
        ))}
        <button
          className="btn btn-sm agent-recheck"
          onClick={recheck}
          disabled={rechecking}
          title="Re-poll each agent's auth status"
        >
          <Icon name="refresh" /> {rechecking ? "Re-checking…" : "Re-check"}
        </button>
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
        <PermissionPresetSelector preset={preset} onChange={onPresetChange} />
        <motion.button
          className="btn btn-primary btn-connect"
          disabled={disabled || blocked || !cwd.trim()}
          onClick={onConnect}
          title={blocked ? "This agent reports an error — resolve it before connecting" : undefined}
          whileHover={disabled || blocked || !cwd.trim() ? undefined : { scale: 1.03 }}
          whileTap={disabled || blocked || !cwd.trim() ? undefined : { scale: 0.97 }}
        >
          {connecting ? (
            <motion.span
              className="btn-connecting"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
              style={{ display: "inline-flex" }}
            >
              <Icon name="refresh" />
            </motion.span>
          ) : (
            <Icon name="cpu" />
          )}
          {connecting ? " Connecting…" : " Connect"}
        </motion.button>
        {connected && (
          <button
            className="btn btn-sm btn-disconnect"
            onClick={onDisconnect}
            title="End this session and start fresh"
          >
            <Icon name="x" /> Disconnect
          </button>
        )}
      </div>
      {blocked && (
        <p className="agent-blocked-note">
          <Icon name="alert" /> {current?.displayName} reports an error and can't start a session
          until it clears.
        </p>
      )}
      {!blocked && byoLogin && (
        <p className="callout">
          <Icon name="info" /> {current?.displayName} has no API key set — Agent Bridge will use
          your existing {current?.displayName} login (subscription or OAuth). No key needed; just
          Connect.
        </p>
      )}
    </div>
  );
}
