import { motion } from "framer-motion";
import { useState } from "react";
import { useCanonical } from "../state/canonical";
import type { AgentInfo } from "../types";
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

  return (
    <motion.div
      className="glass-card onboarding"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
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

        <Step done={hasProfile} label="Run your first profile">
          <button className="btn btn-sm" onClick={onGoProfile} disabled={!connected}>
            <Icon name="arrowRight" /> Open Profile
          </button>
        </Step>
      </ol>
    </motion.div>
  );
}
