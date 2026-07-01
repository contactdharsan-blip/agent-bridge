import { useState } from "react";
import type { Target } from "../../engineTypes";
import { useCanonical } from "../../state/canonical";
import { Icon } from "../Icon";
import { DriftWrite } from "./DriftWrite";
import { useInstructionsPreview, useMcpPreview } from "./hooks";
import { InstructionsPreview } from "./InstructionsPreview";
import { McpPreview } from "./McpPreview";
import { SecretBindings } from "./SecretBindings";
import { ServerEditor } from "./ServerEditor";

// Config & Projection panel (UI-FR9–15). Edit the canonical store once (left),
// preview and diff each target's native file before any write (right). Everything
// is generate-only and preview-first; the target is chosen by id, never branched.
const TARGETS: { id: Target; label: string }[] = [
  { id: "claude", label: "Claude JSON" },
  { id: "codex", label: "Codex TOML" },
  { id: "cursor", label: "Cursor JSON" },
];

export function ConfigPanel() {
  const store = useCanonical();
  const [target, setTarget] = useState<Target>("claude");

  const mcp = useMcpPreview(target, store.servers);
  const instructions = useInstructionsPreview(target, store.instructions);

  return (
    <div className="config-panel">
      <div className="config-editor-col">
        <ServerEditor />
        <SecretBindings servers={store.servers} />
      </div>

      <div className="config-preview-col">
        <div className="target-selector" role="tablist" aria-label="Projection target">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={target === t.id}
              className={`seg ${target === t.id ? "seg-active" : ""}`}
              onClick={() => setTarget(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="glass-card">
          <h4 className="card-title">
            <Icon name="arrowRight" /> Projected native config
          </h4>
          <p className="card-sub">
            A dry-run preview of what {target}'s file would contain — reviewed as a diff before
            anything touches disk.
          </p>
          <McpPreview target={target} state={mcp} />
          <InstructionsPreview state={instructions} />
        </div>

        <DriftWrite target={target} servers={store.servers} contents={mcp.data?.contents ?? null} />
      </div>
    </div>
  );
}
