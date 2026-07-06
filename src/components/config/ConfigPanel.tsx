import { useState } from "react";
import type { Target } from "../../engineTypes";
import { useCanonical } from "../../state/canonical";
import { load, save } from "../../state/persist";
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

export function ConfigPanel({ cwd }: { cwd: string }) {
  const store = useCanonical();
  // Persisted: the panel unmounts on every tab switch, and a Codex/Cursor user
  // shouldn't re-pick their target every visit.
  const [target, setTargetState] = useState<Target>(() => load<Target>("settings.configTarget", "claude"));
  const setTarget = (t: Target) => {
    setTargetState(t);
    save("settings.configTarget", t);
  };

  const mcp = useMcpPreview(target, store.servers);
  const instructions = useInstructionsPreview(target, store.instructions);

  return (
    <div className="config-panel">
      <div className="config-editor-col">
        <ServerEditor />
        <SecretBindings servers={store.servers} />
      </div>

      <div className="config-preview-col" data-tour-step="config-preview">
        <div className="target-selector" data-tour-step="target-selector" role="group" aria-label="Projection target">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              aria-current={target === t.id ? "true" : undefined}
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
          <InstructionsPreview state={instructions} cwd={cwd} />
        </div>

        <DriftWrite target={target} servers={store.servers} contents={mcp.data?.contents ?? null} cwd={cwd} />
      </div>
    </div>
  );
}
