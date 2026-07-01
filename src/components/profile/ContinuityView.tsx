import type { Agent, ContinuityReport, GapFill } from "../../engineTypes";
import type { AsyncState } from "../config/hooks";
import { Icon } from "../Icon";
import { GapFillItem } from "./GapFillItem";

// Workflow Continuity Report + gap-fills for a target (UI-FR24/25). The four honest
// buckets are always shown — including genuinelyLost, so the product never hides
// what a switch actually costs.
const TARGETS: Agent[] = ["claude", "codex", "cursor"];

export function ContinuityView({
  target,
  onTarget,
  continuity,
  gapFills,
}: {
  target: Agent;
  onTarget: (t: Agent) => void;
  continuity: AsyncState<ContinuityReport>;
  gapFills: AsyncState<GapFill[]>;
}) {
  return (
    <div className="glass-card continuity-view">
      <div className="continuity-head">
        <h3 className="card-title">
          <Icon name="handoff" /> Workflow continuity → {target}
        </h3>
        <div className="target-selector" role="group" aria-label="Continuity target">
          {TARGETS.map((t) => (
            <button
              key={t}
              aria-current={target === t ? "true" : undefined}
              className={`seg ${target === t ? "seg-active" : ""}`}
              onClick={() => onTarget(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {continuity.loading && <div className="skeleton skeleton-block" aria-label="computing" />}
      {continuity.error && (
        <div className="callout callout-error">
          <Icon name="x" /> {continuity.error}
        </div>
      )}

      {continuity.data && (
        <div className="continuity-buckets">
          <section className="bucket bucket-good">
            <div className="bucket-head">
              <Icon name="check" /> Transfers automatically
            </div>
            {continuity.data.transfersAutomatically.length === 0 ? (
              <p className="bucket-empty">Nothing transfers cleanly.</p>
            ) : (
              <ul>
                {continuity.data.transfersAutomatically.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="bucket">
            <div className="bucket-head">
              <Icon name="switch" /> Needs a substitute
            </div>
            {continuity.data.needsSubstitute.length === 0 ? (
              <p className="bucket-empty">None.</p>
            ) : (
              continuity.data.needsSubstitute.map((g, i) => <GapFillItem key={i} gap={g} />)
            )}
          </section>

          <section className="bucket">
            <div className="bucket-head">
              <Icon name="plus" /> Add for parity
            </div>
            {continuity.data.addForParity.length === 0 ? (
              <p className="bucket-empty">None.</p>
            ) : (
              continuity.data.addForParity.map((g, i) => <GapFillItem key={i} gap={g} />)
            )}
          </section>

          <section className="bucket bucket-lost">
            <div className="bucket-head">
              <Icon name="x" /> Genuinely lost
            </div>
            {continuity.data.genuinelyLost.length === 0 ? (
              <p className="bucket-empty">Nothing is lost outright.</p>
            ) : (
              <ul>
                {continuity.data.genuinelyLost.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="merged-section">
        <span className="typo-label">All gap-fillers for {target}</span>
        {gapFills.loading && <div className="skeleton skeleton-block" aria-label="computing gaps" />}
        {gapFills.error && (
          <div className="callout callout-error">
            <Icon name="x" /> {gapFills.error}
          </div>
        )}
        {gapFills.data && gapFills.data.length === 0 && (
          <p className="card-sub">No gaps for this target and profile.</p>
        )}
        {gapFills.data?.map((g, i) => (
          <GapFillItem key={i} gap={g} />
        ))}
      </div>
    </div>
  );
}
