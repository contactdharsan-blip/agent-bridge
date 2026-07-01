import type { InstructionArtifact } from "../../engineTypes";
import { Icon } from "../Icon";
import type { AsyncState } from "./hooks";

// Preview of the projected instructions doc (UI-FR12). The equivalent-not-identical
// flag and the fidelity note are shown inline on every target, always — the whole
// point is that instructions are labeled equivalent, never presented as identical
// (NFR2.2). The honesty affordance is sourced from the backend fields, not copy.
export function InstructionsPreview({ state }: { state: AsyncState<InstructionArtifact> }) {
  const { data, loading, error } = state;

  return (
    <section className="preview-block">
      {loading && !data && <div className="skeleton skeleton-block" aria-label="rendering" />}
      {error && (
        <div className="callout callout-error">
          <Icon name="x" /> Instructions render failed: {error}
        </div>
      )}

      {data && (
        <>
          <header className="preview-head">
            <span className="preview-file">
              <Icon name="info" /> {data.path}
            </span>
            {data.equivalentNotIdentical && (
              <span className="badge badge-accent">
                <Icon name="info" /> equivalent, not identical
              </span>
            )}
          </header>

          <div className="callout callout-honesty">
            <Icon name="info" />
            <span>{data.fidelityNote}</span>
          </div>

          <pre className="code-preview">{data.contents}</pre>
        </>
      )}
    </section>
  );
}
