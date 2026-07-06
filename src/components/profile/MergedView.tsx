import { useState } from "react";
import type { FrictionPattern, MergedProfile, Recommendation } from "../../engineTypes";
import { dismissFriction, getDismissedFriction, undismissFriction } from "../../state/dismissedFriction";
import { Icon } from "../Icon";

// The merged profile (UI-FR21/22/23). The honesty affordance is per-agent: each
// agent's data-volume WEIGHT and absolute CONFIDENCE are both shown, so a thin or
// single-agent profile reads as visibly less certain — never blended into one
// smooth number (NFR2.3).

function confidenceLabel(c: number): { text: string; cls: string } {
  if (c >= 0.66) return { text: "high", cls: "badge-success" };
  if (c >= 0.34) return { text: "moderate", cls: "badge-warning" };
  return { text: "thin", cls: "badge-error" };
}

// Friendly labels for the closed FrictionPattern taxonomy (FR41) — the same
// "one entity, one name" idiom as agentLabel/stopNote elsewhere, rather than
// showing the raw camelCase enum value.
const FRICTION_LABEL: Record<FrictionPattern, string> = {
  prematureSolution: "Jumps to a solution before verifying",
  repeatedInstruction: "Repeats the same instruction across sessions",
  contextBloat: "Threads grow until context is bloated",
  retryLoop: "Retries the same failing approach in a loop",
  abandonOnStall: "Abandons a path as soon as it stalls",
  toolMisfire: "Tool/command misfires",
  authFriction: "Auth/login friction",
  scopeCreep: "Scope expands mid-task",
  other: "Other friction",
};

export function MergedView({
  merged,
  recommendations,
}: {
  merged: MergedProfile;
  recommendations: Recommendation[] | null;
}) {
  // FR41: dismiss/curate — a local display preference, not a data mutation
  // (frictionPoints is emitted fresh by every run). Reversible: dismissed
  // patterns collapse into a "N dismissed — show" toggle rather than
  // vanishing, so curating never becomes a one-way black hole.
  const [dismissed, setDismissed] = useState<FrictionPattern[]>(() => getDismissedFriction());
  const [showDismissed, setShowDismissed] = useState(false);
  const dismiss = (pattern: FrictionPattern) => {
    dismissFriction(pattern);
    setDismissed(getDismissedFriction());
  };
  const undismiss = (pattern: FrictionPattern) => {
    undismissFriction(pattern);
    setDismissed(getDismissedFriction());
  };
  const visibleFriction = merged.frictionPoints.filter((f) => !dismissed.includes(f.pattern));
  const hiddenFriction = merged.frictionPoints.filter((f) => dismissed.includes(f.pattern));

  return (
    <div className="glass-card merged-view">
      <h3 className="card-title">
        <Icon name="user" /> Merged profile
      </h3>

      <div className="agent-weights">
        {merged.agents.map((a) => {
          const conf = confidenceLabel(a.confidence);
          return (
            <div key={a.agent} className="agent-weight">
              <div className="agent-weight-head">
                <span className="agent-weight-name">{a.agent}</span>
                <span className={`badge ${conf.cls}`}>{conf.text} confidence</span>
              </div>
              <div className="weight-bar" aria-hidden="true">
                <div className="weight-fill" style={{ width: `${Math.round(a.weight * 100)}%` }} />
              </div>
              <div className="weight-meta">
                weight {(a.weight * 100).toFixed(0)}% · confidence {a.confidence.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {merged.strengths.length > 0 && (
        <div className="merged-section">
          <span className="typo-label">Strengths</span>
          <div className="chip-row">
            {merged.strengths.map((s) => (
              <span key={s} className="badge badge-neutral">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {merged.taskMix.length > 0 && (
        <div className="merged-section">
          <span className="typo-label">Task mix</span>
          {merged.taskMix.map((t) => (
            <div key={t.category} className="taskmix-row">
              <span className="taskmix-label">{t.category}</span>
              <div className="weight-bar">
                <div className="weight-fill" style={{ width: `${Math.round(t.fraction * 100)}%` }} />
              </div>
              <span className="taskmix-val">{(t.fraction * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {merged.frictionPoints.length > 0 && (
        <div className="merged-section">
          <span className="typo-label">Friction patterns</span>
          {visibleFriction.length === 0 && (
            <p className="card-sub">All friction patterns are dismissed.</p>
          )}
          {visibleFriction.map((f) => (
            <div key={f.pattern} className="friction-item">
              <div className="friction-head">
                <span className="friction-label">{FRICTION_LABEL[f.pattern]}</span>
                <span className="badge badge-neutral">{f.whichAgent}</span>
                <span className="badge badge-neutral">
                  {f.frequency}x
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => dismiss(f.pattern)}
                  title="Hide this pattern from view — reversible below"
                >
                  <Icon name="x" /> Dismiss
                </button>
              </div>
              {f.evidenceExamples.length > 0 && (
                <ul className="friction-evidence">
                  {f.evidenceExamples.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {hiddenFriction.length > 0 && (
            <>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setShowDismissed((s) => !s)}
              >
                {showDismissed ? "Hide" : `${hiddenFriction.length} dismissed — show`}
              </button>
              {showDismissed &&
                hiddenFriction.map((f) => (
                  <div key={f.pattern} className="friction-item friction-dismissed">
                    <div className="friction-head">
                      <span className="friction-label">{FRICTION_LABEL[f.pattern]}</span>
                      <span className="badge badge-neutral">{f.whichAgent}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => undismiss(f.pattern)}
                      >
                        <Icon name="arrowRight" /> Undismiss
                      </button>
                    </div>
                  </div>
                ))}
            </>
          )}
        </div>
      )}

      <div className="merged-section">
        <span className="typo-label">Recommendations</span>
        {recommendations === null && (
          <div
            className="skeleton skeleton-block"
            role="status"
            aria-label="Matching profile to features…"
          />
        )}
        {recommendations && recommendations.length === 0 && (
          <p className="card-sub">Profile too thin to recommend features yet.</p>
        )}
        {recommendations?.map((r, i) => (
          <div key={i} className="reco">
            <div className="reco-head">
              <Icon name="chevronRight" />
              <strong>{r.feature.name}</strong>
              <span className="badge badge-neutral">{r.feature.agent}</span>
            </div>
            <p className="reco-because">{r.because}</p>
            <p className="reco-evidence">
              <Icon name="info" /> {r.evidence}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
