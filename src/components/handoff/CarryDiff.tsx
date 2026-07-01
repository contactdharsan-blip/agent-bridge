import { useEffect, useState } from "react";
import { buildHandoffBrief } from "../../engines";
import type { ContextSnapshot } from "../../engineTypes";
import { Icon } from "../Icon";

// The pre-switch carry-diff (UI-FR16/17) — a BLOCKING honesty gate. What carries is
// derived from the assembled snapshot; what stays behind is the reconstruction-only
// layer (live memory, in-flight state) that by definition can't migrate. The brief
// is rendered explicitly as a reconstructed brief, and the switch is disabled until
// the developer acknowledges the diff.

interface CarryRow {
  label: string;
  detail: string;
  carries: boolean;
}

function carryRows(s: ContextSnapshot): CarryRow[] {
  return [
    { label: "Working directory", detail: s.workingDirectory || "—", carries: !!s.workingDirectory },
    { label: "Open files", detail: `${s.openFiles.length} file(s)`, carries: s.openFiles.length > 0 },
    { label: "Task list", detail: `${s.taskList.length} task(s)`, carries: s.taskList.length > 0 },
    { label: "Recent edits", detail: `${s.recentEdits.length} edit(s)`, carries: s.recentEdits.length > 0 },
    { label: "Decisions", detail: `${s.decisions.length} decision(s)`, carries: s.decisions.length > 0 },
    { label: "Summary", detail: s.conversationSummary ? "included" : "empty", carries: !!s.conversationSummary },
    { label: "Active MCP", detail: `${s.activeMcp.length} server(s)`, carries: s.activeMcp.length > 0 },
    { label: "Active skills", detail: `${s.activeSkills.length} skill(s)`, carries: s.activeSkills.length > 0 },
  ];
}

const STAYS_BEHIND = [
  "Live conversation memory — the outgoing agent's private context",
  "In-flight session & tool state",
  "Anything not captured in the snapshot above",
];

export function CarryDiff({
  snapshot,
  targetAgent,
  canSwitch,
  onSwitch,
}: {
  snapshot: ContextSnapshot;
  targetAgent: string;
  canSwitch: boolean;
  onSwitch: (brief: string) => void;
}) {
  const [brief, setBrief] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);

  // Any edit to the snapshot invalidates a built+acknowledged brief, forcing a
  // rebuild and re-ack so the sent brief always matches the reviewed carry-diff.
  const snapshotKey = JSON.stringify(snapshot);
  useEffect(() => {
    setBrief(null);
    setAcked(false);
    setError(null);
  }, [snapshotKey]);

  const build = () => {
    setBuilding(true);
    setError(null);
    buildHandoffBrief(snapshot)
      .then((b) => setBrief(b))
      .catch((e) => setError(String(e)))
      .finally(() => setBuilding(false));
  };

  const rows = carryRows(snapshot);

  return (
    <div className="carry-diff glass-card">
      <h4 className="card-title">
        <Icon name="switch" /> Carry-diff — {snapshot.sourceAgent || "current"} → {targetAgent}
      </h4>

      <div className="carry-cols">
        <div className="carry-col">
          <div className="carry-col-head carry-in">
            <Icon name="check" /> Carries into the brief
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.label} className={r.carries ? "carry-yes" : "carry-no"}>
                <span className="carry-mark">
                  <Icon name={r.carries ? "check" : "minus"} />
                  {r.label}
                </span>
                <span className="carry-detail">{r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="carry-col">
          <div className="carry-col-head carry-out">
            <Icon name="x" /> Stays behind
          </div>
          <ul>
            {STAYS_BEHIND.map((t) => (
              <li key={t} className="carry-no">
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="carry-actions">
        <button className="btn btn-sm" onClick={build} disabled={building}>
          <Icon name="sparkles" /> {building ? "Building…" : brief ? "Rebuild brief" : "Build brief"}
        </button>
      </div>

      {error && (
        <div className="callout callout-error">
          <Icon name="x" /> Brief build failed: {error}
        </div>
      )}

      {brief && (
        <>
          <div className="callout callout-honesty">
            <Icon name="info" />
            <span>
              This is a <strong>reconstructed brief</strong> — the incoming agent starts a fresh
              session primed with it, not a continuation of the previous conversation.
            </span>
          </div>
          <pre className="code-preview brief-preview">{brief}</pre>

          <label className="carry-ack">
            <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
            I've reviewed what carries and what's left behind.
          </label>

          <button
            className="btn btn-primary"
            disabled={!acked || !canSwitch}
            onClick={() => onSwitch(brief)}
            title={!canSwitch ? "Pick a valid target and working directory first" : undefined}
          >
            <Icon name="arrowRight" /> Switch to {targetAgent} &amp; send brief
          </button>
        </>
      )}
    </div>
  );
}
