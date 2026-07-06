import { useState } from "react";
import type { ConfigValue, EnvVar, McpTransport } from "../../engineTypes";
import { useCanonical } from "../../state/canonical";
import { Icon } from "../Icon";
import { PanelEmpty } from "../PanelEmpty";

// The canonical editor (UI-FR9): a structured form over the canonical entities, so
// the user edits the source of truth and can never touch a native artifact. Covers
// stdio servers (the common case); http servers still project fine but are edited
// as a read-only note here.

function argsToText(args: string[]): string {
  return args.join(" ");
}
function textToArgs(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Render an env value as its editable form. Secrets are references, never
 * literals in disguise — a `${VAR}` reference maps to SecretRef{kind:env}. */
function envValueControls(
  value: ConfigValue,
  onChange: (next: ConfigValue) => void,
) {
  const isSecret = value.type === "secret";
  return (
    <div className="env-value">
      <select
        value={isSecret ? "secret" : "literal"}
        onChange={(e) =>
          onChange(
            e.target.value === "secret"
              ? { type: "secret", secret: { kind: "env", var: "" } }
              : { type: "literal", value: "" },
          )
        }
        aria-label="value kind"
      >
        <option value="literal">literal</option>
        <option value="secret">secret ref</option>
      </select>
      {isSecret ? (
        <span className="secret-input">
          <span className="secret-fix">${"{"}</span>
          <input
            type="text"
            placeholder="ENV_VAR"
            aria-label="Secret env var name"
            value={value.secret.kind === "env" ? value.secret.var : ""}
            onChange={(e) =>
              onChange({ type: "secret", secret: { kind: "env", var: e.target.value } })
            }
          />
          <span className="secret-fix">{"}"}</span>
        </span>
      ) : (
        <input
          type="text"
          placeholder="value"
          aria-label="Environment variable value"
          value={value.value}
          onChange={(e) => onChange({ type: "literal", value: e.target.value })}
        />
      )}
    </div>
  );
}

function StdioFields({
  transport,
  onChange,
}: {
  transport: Extract<McpTransport, { transport: "stdio" }>;
  onChange: (t: McpTransport) => void;
}) {
  const setEnv = (env: EnvVar[]) => onChange({ ...transport, env });
  // Keep the args as raw text locally so a controlled re-derive (split→filter→join)
  // never eats a separating space mid-typing; split into the model on each change.
  const [argsText, setArgsText] = useState(() => argsToText(transport.args));
  // Cards use key={index}, so deleting a non-last server reuses this component
  // instance for the survivor that shifts into the freed index. Re-seed the raw
  // text when the incoming server's args genuinely change (a swap) — but NOT
  // during the user's own typing (where the tokenized text already matches
  // transport.args, so this no-ops and the mid-typing space is preserved).
  const [prevArgs, setPrevArgs] = useState(transport.args);
  if (transport.args !== prevArgs) {
    setPrevArgs(transport.args);
    if (argsToText(textToArgs(argsText)) !== argsToText(transport.args)) {
      setArgsText(argsToText(transport.args));
    }
  }
  return (
    <>
      <label className="field-inline">
        Command
        <input
          type="text"
          value={transport.command}
          onChange={(e) => onChange({ ...transport, command: e.target.value })}
        />
      </label>
      <label className="field-inline">
        Args
        <input
          type="text"
          placeholder="-y @modelcontextprotocol/server-github"
          value={argsText}
          onChange={(e) => {
            setArgsText(e.target.value);
            onChange({ ...transport, args: textToArgs(e.target.value) });
          }}
        />
      </label>
      <div className="env-list">
        <div className="env-list-head">
          <span>Environment</span>
          <button
            className="btn btn-sm btn-ghost"
            aria-label="Add env var"
            onClick={() => setEnv([...transport.env, { key: "", value: { type: "literal", value: "" } }])}
          >
            <Icon name="plus" /> env var
          </button>
        </div>
        {transport.env.map((ev, i) => (
          <div key={i} className="env-row">
            <input
              className="env-key"
              type="text"
              placeholder="KEY"
              aria-label="Environment variable name"
              value={ev.key}
              onChange={(e) =>
                setEnv(transport.env.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
              }
            />
            {envValueControls(ev.value, (value) =>
              setEnv(transport.env.map((x, j) => (j === i ? { ...x, value } : x))),
            )}
            <button
              className="btn btn-sm btn-ghost icon-btn"
              aria-label="remove env var"
              onClick={() => setEnv(transport.env.filter((_, j) => j !== i))}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function ServerEditor() {
  const store = useCanonical();

  return (
    <div className="server-editor">
      <div className="editor-head">
        <h3 className="card-title">
          <Icon name="config" /> Canonical MCP servers
        </h3>
        <button className="btn btn-sm btn-primary" onClick={store.addServer}>
          <Icon name="plus" /> Add server
        </button>
      </div>

      {store.servers.length === 0 && (
        <PanelEmpty
          icon="config"
          title="No servers yet"
          hint="Add one — it's projected into each agent's native format below."
        />
      )}

      {store.servers.map((server, index) => (
        <div key={index} className="glass-card server-card">
          <div className="server-card-head">
            <input
              className="server-name"
              type="text"
              value={server.name}
              onChange={(e) => store.updateServer(index, { ...server, name: e.target.value })}
              aria-label="server name"
            />
            <label className="disabled-toggle">
              <input
                type="checkbox"
                checked={server.disabled}
                onChange={(e) => store.updateServer(index, { ...server, disabled: e.target.checked })}
              />
              disabled
            </label>
            <button
              className="btn btn-sm btn-ghost icon-btn"
              aria-label="remove server"
              onClick={() => store.removeServer(index)}
            >
              <Icon name="trash" />
            </button>
          </div>

          {server.transport.transport === "stdio" ? (
            <StdioFields
              transport={server.transport}
              onChange={(transport) => store.updateServer(index, { ...server, transport })}
            />
          ) : (
            <p className="card-sub">
              HTTP server <code>{server.transport.url}</code> — projected as-is (edit http servers
              in a later iteration).
            </p>
          )}
        </div>
      ))}

      <label className="field instructions-field">
        <span className="card-title">
          <Icon name="info" /> Instructions (canonical)
        </span>
        <textarea
          rows={5}
          placeholder="Project instructions — projected as CLAUDE.md / AGENTS.md / .cursorrules (equivalent, not identical)."
          value={store.instructions.markdown}
          onChange={(e) => store.setInstructions(e.target.value)}
        />
      </label>

      {/* AGENTS.md is a full canonical entity (passed through verbatim by the
          projection engine) — without this field it was persisted and projected
          but unreachable from the UI. */}
      <label className="field instructions-field">
        <span className="card-title">
          <Icon name="config" /> AGENTS.md (canonical)
        </span>
        <textarea
          rows={5}
          placeholder="AGENTS.md contents — passed through verbatim to agents that read it."
          value={store.agentsMd}
          onChange={(e) => store.setAgentsMd(e.target.value)}
        />
      </label>
    </div>
  );
}
