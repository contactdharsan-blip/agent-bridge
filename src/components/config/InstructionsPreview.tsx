import { useState } from "react";
import { writeNativeFile } from "../../engines";
import type { InstructionArtifact } from "../../engineTypes";
import { useToast } from "../../state/toast";
import { Icon } from "../Icon";
import type { AsyncState } from "./hooks";

// Preview of the projected instructions doc (UI-FR12, FR24). The equivalent-not-
// identical flag and the fidelity note are shown inline on every target, always —
// the whole point is that instructions are labeled equivalent, never presented as
// identical (NFR2.2). The honesty affordance is sourced from the backend fields,
// not copy. "Apply" writes straight to `data.path` under `cwd` when set; falls
// back to the copy-then-place-yourself loop (unchanged) when there's no working
// directory or the write fails, so nothing regresses for that case.
export function InstructionsPreview({
  state,
  cwd,
}: {
  state: AsyncState<InstructionArtifact>;
  cwd: string;
}) {
  const { data, loading, error } = state;
  const toast = useToast();
  const [writing, setWriting] = useState(false);

  const copy = async (contents: string, path: string) => {
    try {
      await navigator.clipboard.writeText(contents);
      toast.push("success", `${path} instructions copied — paste into the target file`);
    } catch {
      toast.push("info", "Clipboard blocked — copy the previewed instructions manually");
    }
  };

  const apply = async (artifact: InstructionArtifact) => {
    if (!cwd.trim()) {
      await copy(artifact.contents, artifact.path);
      return;
    }
    setWriting(true);
    try {
      await writeNativeFile(cwd, artifact.path, artifact.contents);
      toast.push("success", `Wrote ${artifact.path}`);
    } catch (e) {
      toast.push("info", `Couldn't write ${artifact.path} directly (${String(e)}) — falling back to clipboard`);
      await copy(artifact.contents, artifact.path);
    } finally {
      setWriting(false);
    }
  };

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
            <span className="preview-head-actions">
              {data.equivalentNotIdentical && (
                <span className="badge badge-accent">
                  <Icon name="info" /> equivalent, not identical
                </span>
              )}
              <button className="btn btn-sm" onClick={() => apply(data)} disabled={writing}>
                <Icon name="check" /> {writing ? "Writing…" : cwd.trim() ? "Write instructions" : "Copy instructions"}
              </button>
            </span>
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
