import { useEffect, useState } from "react";
import { checkDrift } from "../../engines";
import type { DriftStatus, McpServer, Target } from "../../engineTypes";
import { useToast } from "../../state/toast";
import { Icon } from "../Icon";

// Drift detection + the reviewed write (UI-FR13/14). The honesty gate is BLOCKING:
// the projected config can't be applied until the on-disk file has been compared,
// so a hand-edited native file is never silently clobbered. There is no fs-write
// among the 15 commands, so "apply" copies the reviewed artifact for placement at
// the shown path (the write itself is outside the engine boundary, by design).

type DriftState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "done"; status: DriftStatus }
  | { phase: "error"; message: string };

function DriftResult({ status }: { status: DriftStatus }) {
  switch (status.status) {
    case "missing":
      return (
        <div className="callout">
          <Icon name="info" /> Target file is absent — this write creates it.
        </div>
      );
    case "inSync":
      return (
        <div className="callout callout-honesty">
          <Icon name="check" /> On-disk file is in sync with the projection.
        </div>
      );
    case "unreadable":
      return (
        <div className="callout callout-error">
          <Icon name="x" /> Target unreadable: {status.detail}
        </div>
      );
    case "drifted":
      return (
        <div className="callout callout-warning drift-detail">
          <Icon name="alert" />
          <div>
            <strong>On-disk file has drifted</strong> — review before overwriting:
            <ul className="drift-list">
              {status.added.map((k) => (
                <li key={`a${k}`} className="drift-added">+ {k}</li>
              ))}
              {status.removed.map((k) => (
                <li key={`r${k}`} className="drift-removed">− {k}</li>
              ))}
              {status.changed.map((k) => (
                <li key={`c${k}`} className="drift-changed">~ {k}</li>
              ))}
            </ul>
          </div>
        </div>
      );
  }
}

export function DriftWrite({
  target,
  servers,
  contents,
}: {
  target: Target;
  servers: McpServer[];
  contents: string | null;
}) {
  const [onDisk, setOnDisk] = useState("");
  const [drift, setDrift] = useState<DriftState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  // A new projection must be re-reviewed before it can be written.
  const serversKey = JSON.stringify(servers);
  useEffect(() => {
    setDrift({ phase: "idle" });
    setCopied(false);
  }, [target, serversKey]);

  const reviewed = drift.phase === "done" || drift.phase === "error";

  const runCheck = () => {
    setDrift({ phase: "checking" });
    checkDrift(target, onDisk.trim() ? onDisk : null, servers)
      .then((status) => setDrift({ phase: "done", status }))
      .catch((e) => setDrift({ phase: "error", message: String(e) }));
  };

  const apply = async () => {
    if (!contents) return;
    try {
      await navigator.clipboard.writeText(contents);
      setCopied(true);
      toast.push("success", `Approved ${target} config copied`);
    } catch {
      setCopied(true); // clipboard blocked in webview — the artifact is still shown above
      toast.push("info", "Clipboard blocked — copy the previewed config manually");
    }
  };

  return (
    <section className="drift-write glass-card">
      <h4 className="card-title">
        <Icon name="shield" /> Drift review &amp; write
      </h4>
      <p className="card-sub">
        Paste the current on-disk file to compare, or leave empty if it doesn't exist yet. The write
        is gated behind this review — nothing is clobbered silently.
      </p>

      <textarea
        className="ondisk-input"
        rows={4}
        aria-label={`Current on-disk contents of ${target}'s native file`}
        placeholder={`current contents of ${target}'s native file (optional)`}
        value={onDisk}
        onChange={(e) => setOnDisk(e.target.value)}
      />

      <div className="drift-actions">
        <button className="btn btn-sm" onClick={runCheck} disabled={drift.phase === "checking"}>
          <Icon name="refresh" /> {drift.phase === "checking" ? "Checking…" : "Check drift"}
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={apply}
          disabled={!reviewed || !contents}
          title={!reviewed ? "Review drift before writing" : undefined}
        >
          <Icon name="check" /> Copy approved config
        </button>
      </div>

      {drift.phase === "done" && <DriftResult status={drift.status} />}
      {drift.phase === "error" && (
        <div className="callout callout-error">
          <Icon name="x" /> Drift check failed: {drift.message}
        </div>
      )}
      {copied && (
        <div className="callout callout-honesty">
          <Icon name="check" /> Approved config copied — paste it into the target's native file, then
          re-check drift to confirm it's in sync.
        </div>
      )}
    </section>
  );
}
