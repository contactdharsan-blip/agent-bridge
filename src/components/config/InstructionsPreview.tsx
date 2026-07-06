import { useEffect, useRef, useState } from "react";
import { readNativeFile, writeNativeFile } from "../../engines";
import type { InstructionArtifact } from "../../engineTypes";
import { prefersReducedMotion } from "../../state/motion";
import { getFingerprint, setFingerprint } from "../../state/nativeFileFingerprint";
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
//
// FR25 (auto-reproject on change): once the user has made at least one real
// canonical edit since mount, `apply` fires automatically instead of waiting
// for the button click. It still only WRITES directly when the on-disk file
// is absent/already matching, or — new — when it differs but those bytes are
// the fingerprint we last confirmed as our own write (so the difference is
// purely canonical having moved on, not a hand-edit). Anything else still
// opens the same manual overwrite gate as before, just proactively instead of
// waiting for a click first — the drift guard itself is never weakened.
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
  // Set when the on-disk file exists and DIFFERS from the projection — the write
  // is BLOCKED behind an explicit overwrite confirmation so a hand-edited
  // CLAUDE.md / AGENTS.md / .cursorrules is never silently clobbered (NFR2),
  // matching the blocking review DriftWrite enforces for MCP config.
  const [overwrite, setOverwrite] = useState<
    null | { path: string; contents: string; onDisk: string }
  >(null);

  // A pending overwrite review is keyed to the projection it was opened for —
  // if the projection re-renders (user edited the canonical instructions, or
  // the target switched), the reviewed pair is stale and the gate must reset
  // rather than write outdated contents past a review of something else.
  useEffect(() => {
    setOverwrite(null);
  }, [data?.path, data?.contents]);

  // FR25 arming: auto-regen only after a REAL canonical edit since mount —
  // never on the very first render (prevKeyRef starts equal to artifactKey,
  // so mount never arms it) — so opening the Config tab can't silently
  // write/prompt for a file the user hasn't touched anything to justify yet.
  const artifactKey = data ? `${data.path} ${data.contents}` : null;
  const prevArtifactKeyRef = useRef(artifactKey);
  const autoRegenArmedRef = useRef(false);
  const autoApplyingRef = useRef(false);
  useEffect(() => {
    if (prevArtifactKeyRef.current !== artifactKey) autoRegenArmedRef.current = true;
    prevArtifactKeyRef.current = artifactKey;
  }, [artifactKey]);

  // The gate renders below a 20rem-capped <pre>; without this, clicking
  // "Write instructions" (in the header, top of the card) appears to do
  // nothing — the review it opened is below the fold.
  const gateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (overwrite) {
      gateRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "nearest",
      });
    }
  }, [overwrite]);

  const copy = async (contents: string, path: string) => {
    try {
      await navigator.clipboard.writeText(contents);
      toast.push("success", `${path} instructions copied — paste into the target file`);
    } catch {
      toast.push("info", "Clipboard blocked — copy the previewed instructions manually");
    }
  };

  const write = async (path: string, contents: string) => {
    setWriting(true);
    try {
      await writeNativeFile(cwd, path, contents);
      // FR25: remember these exact bytes as ours, so a FUTURE difference
      // caused purely by canonical moving on (not a hand-edit) can be told
      // apart from one where someone touched the file out of band.
      setFingerprint(cwd, path, contents);
      toast.push("success", autoApplyingRef.current ? `Auto-regenerated ${path}` : `Wrote ${path}`);
    } catch (e) {
      toast.push("error", `Couldn't write ${path} directly (${String(e)}) — falling back to clipboard`);
      await copy(contents, path);
    } finally {
      setWriting(false);
      setOverwrite(null);
    }
  };

  // Live projection for staleness checks inside async flows — `apply` closes
  // over the artifact at click time, and the reset-on-data-change effect can't
  // catch a gate that OPENS after the change (the read is async).
  const dataRef = useRef(data);
  dataRef.current = data;
  const isStale = (artifact: InstructionArtifact) =>
    dataRef.current?.path !== artifact.path || dataRef.current?.contents !== artifact.contents;

  const apply = async (artifact: InstructionArtifact) => {
    if (!cwd.trim()) {
      await copy(artifact.contents, artifact.path);
      return;
    }
    // Compare against the on-disk file BEFORE writing — never overwrite unseen.
    setWriting(true);
    let onDisk: string | null;
    try {
      onDisk = await readNativeFile(cwd, artifact.path);
    } catch (e) {
      setWriting(false);
      toast.push("info", `Couldn't read ${artifact.path} to compare (${String(e)}) — copy it manually`);
      await copy(artifact.contents, artifact.path);
      return;
    }
    setWriting(false);
    // The projection may have re-rendered while we were reading (a canonical
    // edit inside the 250ms debounce) — never write or open a review for
    // contents the preview no longer shows.
    if (isStale(artifact)) {
      toast.push("info", "The projection changed while comparing — review the updated preview and write again");
      return;
    }
    // Absent or already identical → nothing is destroyed; write directly.
    if (onDisk === null || onDisk.trim() === artifact.contents.trim()) {
      // Confirm the on-disk bytes as ours going forward, whoever wrote them.
      if (onDisk !== null) setFingerprint(cwd, artifact.path, onDisk);
      await write(artifact.path, artifact.contents);
      return;
    }
    // Differs — safe to auto-regenerate ONLY if these exact on-disk bytes are
    // the fingerprint we last confirmed as our own write (FR25): then the
    // difference is purely canonical having moved on, not a hand-edit.
    // Anything else can't rule out a hand-edit and must BLOCK on the manual
    // overwrite decision below (UI-FR14/NFR2).
    if (autoRegenArmedRef.current && onDisk === getFingerprint(cwd, artifact.path)) {
      toast.push(
        "info",
        `Auto-regenerating ${artifact.path} — canonical changed and no hand-edit was detected.`,
      );
      await write(artifact.path, artifact.contents);
      return;
    }
    setOverwrite({ path: artifact.path, contents: artifact.contents, onDisk });
  };

  // FR25: fire `apply` automatically once armed, instead of waiting for the
  // button click — it still only writes directly in the safe cases above;
  // anything else just opens the same manual gate proactively.
  useEffect(() => {
    if (!autoRegenArmedRef.current || !data || !cwd.trim() || writing || overwrite || autoApplyingRef.current) {
      return;
    }
    autoApplyingRef.current = true;
    void apply(data).finally(() => {
      autoApplyingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactKey, cwd]);

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
                <span className="badge badge-honesty">
                  <Icon name="info" /> equivalent, not identical
                </span>
              )}
              <button
                className="btn btn-sm"
                onClick={() => apply(data)}
                disabled={writing || overwrite !== null}
              >
                <Icon name="check" /> {writing ? "Writing…" : cwd.trim() ? "Write instructions" : "Copy instructions"}
              </button>
            </span>
          </header>

          <div className="callout callout-honesty">
            <Icon name="info" />
            <span>{data.fidelityNote}</span>
          </div>

          <pre className="code-preview">{data.contents}</pre>

          {overwrite && overwrite.path === data.path && (
            <div className="drift-write" ref={gateRef}>
              <h4 className="card-title">
                <Icon name="shield" /> Drift review
              </h4>
              <div className="callout callout-warning">
                <Icon name="alert" />
                <span>
                  <strong>{overwrite.path}</strong> has drifted from the projection — writing will
                  overwrite your hand-edited file. Review its current contents below before
                  overwriting.
                </span>
              </div>
              <p className="typo-label">Current on-disk contents</p>
              <pre className="code-preview">{overwrite.onDisk}</pre>
              <div className="drift-actions">
                <button className="btn btn-sm btn-ghost" onClick={() => setOverwrite(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const o = overwrite;
                    setOverwrite(null);
                    void copy(o.contents, o.path);
                  }}
                >
                  <Icon name="switch" /> Copy instead
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => void write(overwrite.path, overwrite.contents)}
                  disabled={writing}
                >
                  <Icon name="check" /> {writing ? "Writing…" : `Overwrite ${overwrite.path}`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
