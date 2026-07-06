import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { runDoctor } from "../ipc";
import type { DoctorReport } from "../types";
import { AuthBadge } from "./AuthBadge";
import { Icon } from "./Icon";

// FR32 — local doctor diagnostics. A read-only, never-uploaded health check so
// a user (or the solo builder) can see why something isn't working: is
// Node/npx installed, do the bundled adapters resolve to a launchable
// command, is the OS keychain reachable. Every status is icon + text, never
// color alone (UI-NFR6) — this is essentially AuthBadge's pattern applied to
// local system state instead of per-agent auth.

type LoadState =
  | { phase: "loading" }
  | { phase: "done"; report: DoctorReport }
  | { phase: "error"; message: string };

function VersionRow({ label, version }: { label: string; version: string | null }) {
  return (
    <li className="doctor-row">
      <span className="doctor-row-label">{label}</span>
      {version ? (
        <span className="badge badge-success">
          <Icon name="check" /> {version}
        </span>
      ) : (
        <span className="badge badge-warning">
          <Icon name="alert" /> not found
        </span>
      )}
    </li>
  );
}

function KeychainRow({ keychain }: { keychain: DoctorReport["keychain"] }) {
  const ok = "Ok" in keychain && keychain.Ok;
  return (
    <li className="doctor-row">
      <span className="doctor-row-label">OS keychain</span>
      {ok ? (
        <span className="badge badge-success">
          <Icon name="check" /> reachable
        </span>
      ) : (
        <span className="badge badge-error" title={"Err" in keychain ? keychain.Err : undefined}>
          <Icon name="x" /> unreachable
        </span>
      )}
    </li>
  );
}

function DoctorBody({ report }: { report: DoctorReport }) {
  const keychain = report.keychain;
  return (
    <div className="doctor-body">
      <section className="doctor-section">
        <h4 className="card-title">
          <Icon name="cpu" /> Runtime
        </h4>
        <ul className="doctor-list">
          <VersionRow label="Node" version={report.nodeVersion} />
          <VersionRow label="npx" version={report.npxVersion} />
        </ul>
        {(!report.nodeVersion || !report.npxVersion) && (
          <p className="callout callout-warning">
            <Icon name="alert" /> Every bundled adapter is launched via <code>npx</code> — without
            Node/npx on PATH, agent sessions can't start.
          </p>
        )}
      </section>

      <section className="doctor-section">
        <h4 className="card-title">
          <Icon name="config" /> Adapters
        </h4>
        <ul className="doctor-list">
          {report.agents.map((a) => (
            <li key={a.id} className="doctor-row doctor-row-agent">
              <div className="doctor-agent-id">
                <span className="doctor-row-label">{a.displayName}</span>
                <AuthBadge status={a.authStatus} />
              </div>
              <code className="doctor-command">
                {a.resolvedCommand} {a.resolvedArgs.join(" ")}
              </code>
            </li>
          ))}
        </ul>
      </section>

      <section className="doctor-section">
        <h4 className="card-title">
          <Icon name="key" /> Secrets
        </h4>
        <ul className="doctor-list">
          <KeychainRow keychain={keychain} />
        </ul>
        {"Err" in keychain && (
          <p className="callout callout-error">
            <Icon name="x" /> Keychain probe failed: {keychain.Err}
          </p>
        )}
      </section>
    </div>
  );
}

export function DoctorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });

  const load = () => {
    setState({ phase: "loading" });
    runDoctor()
      .then((report) => setState({ phase: "done", report }))
      .catch((e) => setState({ phase: "error", message: String(e) }));
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="palette-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount className="doctor-modal glass-card">
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -8 }}
                transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="doctor-head">
                  <Dialog.Title className="card-title">
                    <Icon name="activity" /> Doctor diagnostics
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button className="banner-close" aria-label="Close doctor diagnostics">
                      <Icon name="x" />
                    </button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="card-sub">
                  A local, read-only health check — nothing here is ever uploaded.
                </Dialog.Description>

                {state.phase === "loading" && (
                  <>
                    <p className="callout">
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                        style={{ display: "inline-flex" }}
                      >
                        <Icon name="refresh" />
                      </motion.span>{" "}
                      Running checks…
                    </p>
                    {/* Skeleton rows shaped like the report reserve its height,
                        so the modal doesn't snap taller when results land. */}
                    <div className="doctor-skeleton" aria-hidden="true">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} className="skeleton skeleton-row" />
                      ))}
                    </div>
                  </>
                )}
                {state.phase === "error" && (
                  <p className="callout callout-error">
                    <Icon name="x" /> Doctor run failed: {state.message}
                  </p>
                )}
                {state.phase === "done" && <DoctorBody report={state.report} />}

                <div className="doctor-actions">
                  <button className="btn btn-sm" onClick={load} disabled={state.phase === "loading"}>
                    <Icon name="refresh" /> Re-run
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
