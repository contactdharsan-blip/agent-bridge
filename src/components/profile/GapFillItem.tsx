import { useId, useState } from "react";
import type { GapFill } from "../../engineTypes";
import { Icon } from "../Icon";

// One gap-filler (UI-FR25). Every item is marked equivalent vs approximation; a
// marketplace filler shows its source before any install and never auto-installs;
// a generated skill is shown as a reviewable diff alongside the friction that
// motivated it (NFR2.5). Nothing third-party is written unreviewed.
export function GapFillItem({ gap }: { gap: GapFill }) {
  const [open, setOpen] = useState(false);
  const skillId = useId();
  const equiv = gap.equivalence === "equivalent";

  return (
    <div className="gapfill">
      <div className="gapfill-head">
        <span className="gapfill-cap">{gap.capability}</span>
        <span className={`badge ${equiv ? "badge-success" : "badge-warning"}`}>
          <Icon name={equiv ? "check" : "alert"} /> {gap.equivalence}
        </span>
        {gap.profileSpecific && <span className="badge badge-accent">for you</span>}
      </div>
      <p className="gapfill-motivation">{gap.motivation}</p>

      {gap.resolution.kind === "marketplace" && (
        <div className="gapfill-resolution">
          <div className="callout">
            <Icon name="info" />
            <span>
              Marketplace skill <strong>{gap.resolution.name}</strong> — review the source before
              installing; nothing is auto-installed.
            </span>
          </div>
          <a className="btn btn-sm" href={gap.resolution.source} target="_blank" rel="noreferrer">
            <Icon name="arrowRight" /> Open source
          </a>
        </div>
      )}

      {gap.resolution.kind === "generatedSkill" && (
        <div className="gapfill-resolution">
          <button
            className="btn btn-sm"
            aria-expanded={open}
            aria-controls={skillId}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? "minus" : "plus"} /> {open ? "Hide" : "Review"} generated skill:{" "}
            {gap.resolution.name}
          </button>
          {open && (
            <pre id={skillId} className="code-preview">
              {gap.resolution.skillMd}
            </pre>
          )}
        </div>
      )}

      {gap.resolution.kind === "rule" && (
        <div className="gapfill-resolution">
          <span className="typo-label">Canonical rule</span>
          <pre className="code-preview">{gap.resolution.canonicalRule}</pre>
        </div>
      )}
    </div>
  );
}
