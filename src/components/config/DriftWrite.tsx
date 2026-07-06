import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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
  // The explicit "I reviewed the drift" acknowledgement — required ONLY when
  // the comparison found real drift (the dangerous case). Clean verdicts
  // (missing / inSync) have nothing to clobber and need no ceremony. This is
  // STRONGER than the old click-"Check drift"-to-unlock: a click proved the
  // check ran, not that anyone read the result.
  const [driftAcked, setDriftAcked] = useState(false);
  const [applied, setApplied] = useState<null | "written" | "copied" | "manual">(null);
  const toast = useToast();

  // Any transition away from a completed verdict (re-check starting, basis
  // change → idle) revokes the acknowledgement with it.
  useEffect(() => {
    if (drift.phase !== "done") setDriftAcked(false);
  }, [drift.phase]);

  // Monotonic token shared by every comparison (auto, manual click, post-write
  // confirm): each run captures ++seq and only commits its verdict if still
  // current, and every basis invalidation bumps it. Guarantees a verdict can
  // never land against a basis it wasn't run for (a stale manual re-check
  // resolving after a paste edit could otherwise unlock the gate), without
  // putting drift.phase in any effect's deps — the previous shape cancelled
  // its own in-flight check via its cleanup and stuck the gate at "checking".
  const checkSeq = useRef(0);

  // Auto-read the on-disk file whenever the target or working directory
  // changes, and reset the review gate — a new file (or a new projection
  // below) must be re-reviewed before it can be applied.
  useEffect(() => {
    checkSeq.current += 1;
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
    checkSeq.current += 1;
    setDrift({ phase: "idle" });
    setApplied(null);
  }, [serversKey]);

  // Changing the review BASIS (opening the manual paste, or editing its text)
  // invalidates a prior review too — otherwise a user could review against one
  // on-disk value, then edit the paste and write past the stale gate. Same class
  // as the cwd/servers resets above; keeps the BLOCKING gate honest (NFR2).
  useEffect(() => {
    checkSeq.current += 1;
    setDrift({ phase: "idle" });
    setApplied(null);
  }, [manualOpen, manualText]);

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
  // On top of that, a DRIFTED verdict blocks until explicitly acknowledged.
  const compared =
    drift.phase === "done" && drift.status.status !== "unreadable" && read.phase !== "reading";
  const needsAck = compared && drift.phase === "done" && drift.status.status === "drifted";
  const reviewed = compared && (!needsAck || driftAcked);

  const runCheck = () => {
    const seq = ++checkSeq.current;
    setDrift({ phase: "checking" });
    checkDrift(target, onDiskValue, servers)
      .then((status) => {
        if (checkSeq.current === seq) setDrift({ phase: "done", status });
      })
      .catch((e) => {
        if (checkSeq.current === seq) setDrift({ phase: "error", message: String(e) });
      });
  };

  // Auto-compare as soon as an auto-read lands: the check is read-only, so
  // running it costs nothing and removes the dead "Check drift" click. Never
  // fires in manual-paste mode (a paste is checked deliberately). Deps are the
  // BASIS only — never drift.phase: keying on the state this effect itself
  // sets made React run the cleanup right after the "checking" render, which
  // cancelled the in-flight IPC and left the gate stuck at "checking" forever
  // in the real app (mocked IPC resolves before the re-render and hid it).
  // The BLOCKING part of the gate is unchanged — it lives in `reviewed`.
  useEffect(() => {
    if (usingManual || read.phase !== "ok") return;
    const seq = ++checkSeq.current;
    setDrift({ phase: "checking" });
    checkDrift(target, read.contents, servers)
      .then((status) => {
        if (checkSeq.current === seq) setDrift({ phase: "done", status });
      })
      .catch((e) => {
        if (checkSeq.current === seq) setDrift({ phase: "error", message: String(e) });
      });
    return () => {
      // Unmount / basis change: retire this run so it can't commit late.
      checkSeq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingManual, read, serversKey, target]);

  const apply = async () => {
    if (!contents) return;

    if (cwd.trim()) {
      try {
        await writeNativeFile(cwd, path, contents);
        setApplied("written");
        toast.push("success", `Wrote ${path}`);
        // Confirm the write actually landed in sync. Auto path: the fresh
        // read-state change re-fires the auto-compare effect (which takes a
        // newer seq and owns the verdict). Manual path: compare here, since
        // the auto effect never runs in manual mode.
        const seq = ++checkSeq.current;
        setDrift({ phase: "checking" });
        try {
          const fresh = await readNativeFile(cwd, path);
          setRead({ phase: "ok", contents: fresh });
          if (usingManual) {
            const status = await checkDrift(target, fresh, servers);
            if (checkSeq.current === seq) setDrift({ phase: "done", status });
          }
        } catch (e) {
          if (checkSeq.current === seq) setDrift({ phase: "error", message: String(e) });
        }
        return;
      } catch (e) {
        toast.push("error", `Couldn't write ${path} directly (${String(e)}) — falling back to clipboard`);
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
          ? `${path} is read from disk and compared with the projection automatically. A clean verdict unlocks the write; real drift must be explicitly acknowledged first.`
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

      {/* Verdict FIRST, actions after it — the write button sits below the
          evidence it depends on, not above the fold from it. */}
      {drift.phase === "checking" && (
        <div className="skeleton skeleton-block" aria-label="comparing with the projection" />
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
      {needsAck && (
        <label className="carry-ack">
          <input
            type="checkbox"
            checked={driftAcked}
            onChange={(e) => setDriftAcked(e.target.checked)}
          />
          I've reviewed the drift above — overwrite the on-disk file.
        </label>
      )}

      <div className="drift-actions">
        <button
          className="btn btn-sm"
          onClick={runCheck}
          disabled={drift.phase === "checking" || read.phase === "reading"}
        >
          <Icon name="refresh" /> {drift.phase === "checking" ? "Checking…" : "Re-check drift"}
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
          <Icon name="alert" />{" "}
          {drift.phase === "checking" || read.phase === "reading"
            ? "Comparing the on-disk file with the projection…"
            : needsAck
              ? "Confirm you've reviewed the drift above before overwriting."
              : drift.phase === "done"
                ? "The on-disk file couldn't be read for comparison — fix it or paste its contents manually."
                : drift.phase === "error"
                  ? "The drift check failed — re-check before applying."
                  : "Check drift above before applying the config."}
        </p>
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
