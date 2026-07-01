import type { MergedProfile, Recommendation } from "../../engineTypes";
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

export function MergedView({
  merged,
  recommendations,
}: {
  merged: MergedProfile;
  recommendations: Recommendation[] | null;
}) {
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

      <div className="merged-section">
        <span className="typo-label">Recommendations</span>
        {recommendations === null && <div className="skeleton skeleton-block" aria-label="matching" />}
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
