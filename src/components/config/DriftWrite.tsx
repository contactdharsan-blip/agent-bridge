import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { checkDrift, readNativeFile, writeNativeFile } from "../../engines";
import type { DriftStatus, McpServer, Target } from "../../engineTypes";
import { useToast } from "../../state/toast";
import { Icon } from "../Icon";
import { TARGET_FILE } from "./targets";

// Drift detection + the reviewed write (UI-FR13/14, FR24). The honesty gate is
// BLOCKING: the projected config can't be applied until the on-disk file has
// been compared, so a hand-edited native file is never silently clobbered.
// The on-disk comparison is read automatically from `cwd`/`TARGET_FILE[target]`
// (a real fs read — no more manually pasting the current file); a collapsed
// manual-paste fallback stays available for when `cwd` is empty or the auto
// read fails, so nothing regresses for a user without a working directory set.
// "Apply" writes the approved config straight to disk when `cwd` is set,
// falling back to the clipboard-copy flow only if that write fails (or there's
// no `cwd` to write into).

type ReadState =
  | { phase: "idle" }
  | { phase: "reading" }
  | { phase: "ok"; contents: string | null }
  | { phase: "error"; message: string };

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
  cwd,
}: {
  target: Target;
  servers: McpServer[];
  contents: string | null;
  cwd: string;
}) {
  const path = TARGET_FILE[target];
  const [read, setRead] = useState<ReadState>({ phase: "idle" });
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState("");
  const [drift, setDrift] = useState<DriftState>({ phase: "idle" });
  const [applied, setApplied] = useState<null | "written" | "copied" | "manual">(null);
  const toast = useToast();

  // Auto-read the on-disk file whenever the target or working directory
  // changes, and reset the review gate — a new file (or a new projection
  // below) must be re-reviewed before it can be applied.
  useEffect(() => {
    setDrift({ phase: "idle" });
    setApplied(null);
    setManualOpen(false);
    setManualText("");
    if (!cwd.trim()) {
      setRead({ phase: "error", message: "No working directory set" });
      return;
    }
    let cancelled = false;
    setRead({ phase: "reading" });
    readNativeFile(cwd, path)
      .then((c) => {
        if (!cancelled) setRead({ phase: "ok", contents: c });
      })
      .catch((e) => {
        if (!cancelled) setRead({ phase: "error", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, path]);

  // A new projection must be re-reviewed before it can be written.
  const serversKey = JSON.stringify(servers);
  useEffect(() => {
    setDrift({ phase: "idle" });
    setApplied(null);
  }, [serversKey]);

  const autoReadFailed = read.phase === "error";
  const usingManual = manualOpen || autoReadFailed;
  const onDiskValue: string | null = usingManual
    ? manualText.trim()
      ? manualText
      : null
    : read.phase === "ok"
      ? read.contents
      : null;

  // Only a completed, READABLE comparison unlocks the write gate. A failed
  // check (rejected promise → phase "error") OR an unreadable file — which
  // resolves as phase "done" with status "unreadable", i.e. no comparison
  // actually happened — must not count as reviewed, or a hand-edited native
  // file could be clobbered unseen. Still reading from disk also blocks it.
  const reviewed =
    drift.phase === "done" && drift.status.status !== "unreadable" && read.phase !== "reading";

  const runCheck = () => {
    setDrift({ phase: "checking" });
    checkDrift(target, onDiskValue, servers)
      .then((status) => setDrift({ phase: "done", status }))
      .catch((e) => setDrift({ phase: "error", message: String(e) }));
  };

  const apply = async () => {
    if (!contents) return;

    if (cwd.trim()) {
      try {
        await writeNativeFile(cwd, path, contents);
        setApplied("written");
        toast.push("success", `Wrote ${path}`);
        // Confirm the write actually landed in sync — re-read + re-check.
        setDrift({ phase: "checking" });
        try {
          const fresh = await readNativeFile(cwd, path);
          setRead({ phase: "ok", contents: fresh });
          const status = await checkDrift(target, fresh, servers);
          setDrift({ phase: "done", status });
        } catch (e) {
          setDrift({ phase: "error", message: String(e) });
        }
        return;
      } catch (e) {
        toast.push("info", `Couldn't write ${path} directly (${String(e)}) — falling back to clipboard`);
        // fall through to the clipboard fallback below
      }
    }

    try {
      await navigator.clipboard.writeText(contents);
      setApplied("copied");
      toast.push("success", `Approved ${target} config copied`);
    } catch {
      setApplied("manual"); // clipboard blocked in webview — the artifact is still shown above
      toast.push("info", "Clipboard blocked — copy the previewed config manually");
    }
  };

  return (
    <section className="drift-write glass-card">
      <h4 className="card-title">
        <Icon name="shield" /> Drift review &amp; write
      </h4>
      <p className="card-sub">
        {cwd.trim()
          ? `The current contents of ${path} are read automatically for comparison. Review is required before the approved config can be written.`
          : `Set a working directory above to read ${path} automatically, or paste its current contents below.`}
      </p>

      {!usingManual && read.phase === "reading" && (
        <div className="skeleton skeleton-block" aria-label={`reading ${path}`} />
      )}
      {!usingManual && read.phase === "ok" && (
        <div className="callout">
          <Icon name="info" />
          {read.contents === null
            ? `${path} doesn't exist on disk yet.`
            : `Read the current contents of ${path} from disk.`}
        </div>
      )}

      {usingManual && (
        <>
          {autoReadFailed && !manualOpen && (
            <p className="callout callout-warning">
              <Icon name="alert" /> Couldn't read {path} automatically ({read.phase === "error" ? read.message : ""}) — paste its current contents below, or leave empty if it doesn't exist yet.
            </p>
          )}
          <textarea
            className="ondisk-input"
            rows={4}
            aria-label={`Current on-disk contents of ${target}'s native file`}
            placeholder={`current contents of ${target}'s native file (optional)`}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
          />
        </>
      )}

      {!autoReadFailed && cwd.trim() && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setManualOpen((o) => !o)}
        >
          <Icon name="config" /> {manualOpen ? "Use the auto-read file instead" : "Paste manually instead"}
        </button>
      )}

      <div className="drift-actions">
        <button
          className="btn btn-sm"
          onClick={runCheck}
          disabled={drift.phase === "checking" || read.phase === "reading"}
        >
          <Icon name="refresh" /> {drift.phase === "checking" ? "Checking…" : "Check drift"}
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={apply}
          disabled={!reviewed || !contents}
          aria-describedby={!reviewed ? "drift-blocked" : undefined}
        >
          <Icon name="check" /> {cwd.trim() ? "Write approved config" : "Copy approved config"}
        </button>
      </div>
      {!reviewed && (
        <p className="callout callout-warning" id="drift-blocked">
          <Icon name="alert" /> Check drift above before applying the config.
        </p>
      )}

      {drift.phase === "done" && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
          <DriftResult status={drift.status} />
        </motion.div>
      )}
      {drift.phase === "error" && (
        <motion.div
          className="callout callout-error"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Icon name="x" /> Drift check failed: {drift.message}
        </motion.div>
      )}
      {applied === "written" && (
        <motion.div
          className="callout callout-honesty"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Icon name="check" /> Wrote <code>{path}</code> — drift was re-checked above to confirm it's in sync.
        </motion.div>
      )}
      {applied === "copied" && (
        <motion.div
          className="callout callout-honesty"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Icon name="check" /> Approved {target} config copied — paste it into{" "}
          <code>{path}</code>, then re-check drift to confirm it's in sync.
        </motion.div>
      )}
      {applied === "manual" && (
        <motion.div
          className="callout callout-warning"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Icon name="alert" /> Clipboard was blocked — select the previewed config above and copy it
          manually, then paste it into <code>{path}</code> and re-check drift.
        </motion.div>
      )}
    </section>
  );
}
