import { Icon } from "../Icon";
import type { VibeIndex } from "./vibeIndex";

// Same confidence banding MergedView uses for its per-agent badges — kept in sync
// on purpose so "confidence" reads identically everywhere in the Profile tab.
function confidenceLabel(c: number): { text: string; cls: string } {
  if (c >= 66) return { text: "high", cls: "badge-success" };
  if (c >= 34) return { text: "moderate", cls: "badge-warning" };
  return { text: "thin", cls: "badge-error" };
}

// Hero summary above MergedView (UI-FR21 area) — a "vibecoder personality" read at a
// glance. The archetype is the headline (the actual personality signal); confidence
// is demoted to a labeled chip, never the star number — it measures data volume, not
// personality, and NFR2 forbids blending confidence into a single smooth "score."
export function VibeIndexCard({ index }: { index: VibeIndex }) {
  const conf = confidenceLabel(index.confidence);
  // A "thin" profile must not read as a settled verdict — down-weight the
  // headline to a leaning and mark the blurb an early read (NFR2). Derived
  // entirely from the banded confidence, never hardcoded.
  const provisional = conf.text === "thin";
  return (
    <div className="glass-card vibe-index-card">
      <h3 className="card-title">
        <Icon name="sparkles" /> Vibecoder index
      </h3>

      <div className="vibe-head">
        <div className="vibe-archetype">
          <span className="vibe-archetype-name">
            {provisional ? `Leaning toward ${index.archetype}` : index.archetype}
          </span>
          <p className="card-sub">{provisional ? `Early read: ${index.blurb}` : index.blurb}</p>
        </div>
        <span className={`badge ${conf.cls} vibe-confidence-badge`}>
          profile confidence: {conf.text} ({index.confidence})
          <span className="sr-only">
            {" "}
            — how much collected data backs this profile, not a personality score
          </span>
        </span>
      </div>

      <div className="vibe-meta-row">
        {index.topCategory && (
          <span className="badge badge-neutral">
            {index.topCategory.category} · {(index.topCategory.fraction * 100).toFixed(0)}% of work
          </span>
        )}
        {index.leadAgent && (
          <span className="badge badge-neutral">
            leans {index.leadAgent.agent} ({(index.leadAgent.weight * 100).toFixed(0)}% weight)
          </span>
        )}
      </div>

      {index.traits.length > 0 && (
        <div className="chip-row">
          {index.traits.map((t) => (
            <span key={t} className="badge badge-success">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
