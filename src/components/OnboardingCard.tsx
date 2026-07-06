import { useEffect, useState } from "react";
import { auditSecretBindings } from "../engines";
import type { SecretBinding } from "../engineTypes";
import { runDoctor } from "../ipc";
import { useCanonical } from "../state/canonical";
import type { AgentInfo, DoctorReport } from "../types";
import { AuthBadge } from "./AuthBadge";
import { Icon, type IconName } from "./Icon";

// First-run onboarding, inline and dismissable (UI-FR28). Reports each agent's auth
// status and points the developer out to that agent's own native login — the app
// never drives the login itself (there is no login command among the 15), it only
// reports and re-polls. Progressive, never a modal wall.
function Step({ done, label, children }: { done: boolean; label: string; children?: React.ReactNode }) {
  const icon: IconName = done ? "check" : "dot";
  return (
    <li className={`onboard-step ${done ? "onboard-done" : ""}`}>
      <span className="onboard-step-icon">
        <Icon name={icon} />
      </span>
      <div className="onboard-step-body">
        <span className="onboard-step-label">{label}</span>
        {children}
      </div>
    </li>
  );
}

export function OnboardingCard({
  agents,
  connected,
  hasProfile,
  canImport,
  importing,
  onGoConfig,
  onGoProfile,
  onRecheck,
  onImportConfig,
  onOpenDoctor,
  onDismiss,
}: {
  agents: AgentInfo[];
  connected: boolean;
  hasProfile: boolean;
  canImport: boolean;
  importing: boolean;
  onGoConfig: () => void;
  onGoProfile: () => void;
  onRecheck: () => Promise<void>;
  onImportConfig: () => Promise<void>;
  /** Opens the Doctor panel (FR48) — the onboarding step below surfaces just
   * the one blocking signal (no Node = no npx-based agent can spawn) inline;
   * the full report is one click away, not duplicated here. */
  onOpenDoctor: () => void;
  onDismiss: () => void;
}) {
  const anyConnected = agents.some((a) => a.authStatus === "connected");
  const [rechecking, setRechecking] = useState(false);
  const recheck = async () => {
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setRechecking(false);
    }
  };
  const canonical = useCanonical();
  // Label is "Set up" not "Project": this proves the canonical config was
  // edited, not that a projection was reviewed/copied — so the step stays
  // literally honest while letting the checklist actually reach 4/4.
  const hasConfig =
    canonical.servers.length > 0 ||
    canonical.instructions.markdown.trim().length > 0 ||
    canonical.agentsMd.trim().length > 0;

  // FR48 gap 1: the wizard didn't detect installed agents itself (that check
  // only lived in the separate, unlinked Doctor panel). Reuses run_doctor
  // directly — no detection logic re-derived here — and surfaces only the
  // one signal that actually blocks Step 1 (no Node → npx can't spawn either
  // npx-based agent). Runs once per mount, not on every render.
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  useEffect(() => {
    let cancelled = false;
    runDoctor()
      .then((r) => !cancelled && setDoctor(r))
      .catch(() => {
        /* best-effort — Step 1's auth badges already carry the real signal */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const nodeMissing = doctor !== null && doctor.nodeVersion === null;

  // FR48 gap 2: no dedicated secret-binding step existed. "Done" means either
  // nothing to bind (no ${VAR} references anywhere) or every reference that
  // exists actually resolves — reuses audit_secret_bindings directly, same
  // as SecretBindings.tsx, rather than re-deriving resolvability here.
  const [bindings, setBindings] = useState<SecretBinding[] | null>(null);
  const serversKey = JSON.stringify(canonical.servers);
  useEffect(() => {
    let cancelled = false;
    auditSecretBindings(canonical.servers)
      .then((b) => !cancelled && setBindings(b))
      .catch(() => {
        /* best-effort — SecretBindings.tsx in the Config tab is the real surface */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serversKey]);
  const unresolvedSecrets = (bindings ?? []).filter((b) => !b.resolvable);
  const secretsDone = bindings !== null && unresolvedSecrets.length === 0;

  return (
    // Plain div, not motion.div: framer-motion transitions were found to
    // never complete in this app (see OnboardingTour.tsx's native-Radix-mount
    // note), which pinned this card at opacity 0 forever — invisible on every
    // load despite being fully mounted underneath.
    <div className="glass-card onboarding">
      <div className="onboarding-head">
        <h3 className="card-title">
          <Icon name="sparkles" /> Get set up
        </h3>
        <button className="btn btn-sm btn-ghost" onClick={onDismiss}>
          <Icon name="x" /> Dismiss
        </button>
      </div>

      <ol className="onboard-steps">
        <Step done={anyConnected} label="Connect an agent">
          <div className="onboard-agents">
            {agents.map((a) => (
              <span key={a.id} className="onboard-agent">
                {a.displayName}
                <AuthBadge status={a.authStatus} env={a.authEnv} />
              </span>
            ))}
          </div>
          {!anyConnected && (
            <>
              <p className="onboard-hint">
                No API key needed — if you're signed into an agent (Claude Pro/Max, ChatGPT,
                Cursor), just pick it and Connect; Agent Bridge uses your existing login. Only set a
                key if you prefer the bring-your-own-key path.
              </p>
              <button className="btn btn-sm" onClick={recheck} disabled={rechecking}>
                <Icon name="refresh" /> {rechecking ? "Re-checking…" : "Re-check"}
              </button>
            </>
          )}
          {nodeMissing && (
            <>
              <p className="onboard-hint onboard-warning">
                <Icon name="alert" /> Node.js wasn't detected — Claude and Codex both launch via{" "}
                <code>npx</code>, so neither can start until it's installed.
              </p>
              <button className="btn btn-sm btn-ghost" onClick={onOpenDoctor}>
                <Icon name="activity" /> Open Doctor for the full picture
              </button>
            </>
          )}
        </Step>

        <Step done={connected} label="Start a session in the Run tab">
          {anyConnected && !connected && (
            <p className="onboard-hint">Pick an agent + working dir above and hit Connect.</p>
          )}
        </Step>

        <Step done={hasConfig} label="Set up your config">
          <div className="onboard-actions">
            <button className="btn btn-primary btn-sm" onClick={onGoConfig}>
              <Icon name="arrowRight" /> Open Config
            </button>
            <button
              className="btn btn-sm"
              onClick={() => void onImportConfig()}
              disabled={!canImport || importing}
              title={canImport ? undefined : "Set a working directory above first"}
            >
              <Icon name="switch" /> {importing ? "Importing…" : "Import existing config"}
            </button>
          </div>
        </Step>

        <Step done={secretsDone} label="Bind any secrets your config needs">
          {bindings === null ? (
            <p className="onboard-hint">Checking…</p>
          ) : bindings.length === 0 ? (
            <p className="onboard-hint">No <code>{"${VAR}"}</code> references yet — nothing to bind.</p>
          ) : unresolvedSecrets.length > 0 ? (
            <p className="onboard-hint onboard-warning">
              <Icon name="alert" /> {unresolvedSecrets.length} secret
              {unresolvedSecrets.length === 1 ? "" : "s"} ({unresolvedSecrets.map((b) => b.envName).join(", ")}
              ) unresolved — never a literal token, just a <code>{"${VAR}"}</code> reference waiting on
              an env var or keychain entry.
            </p>
          ) : (
            <p className="onboard-hint">
              All {bindings.length} secret reference{bindings.length === 1 ? "" : "s"} resolve.
            </p>
          )}
          <button className="btn btn-sm" onClick={onGoConfig}>
            <Icon name="key" /> Open Config → Secret bindings
          </button>
        </Step>

        <Step done={hasProfile} label="Run your first profile">
          {/* Not gated on `connected` — the Profile tab explicitly supports the
              no-session paste-a-CoderProfile-JSON path. */}
          <button className="btn btn-sm" onClick={onGoProfile}>
            <Icon name="arrowRight" /> Open Profile
          </button>
        </Step>
      </ol>
    </div>
  );
}
