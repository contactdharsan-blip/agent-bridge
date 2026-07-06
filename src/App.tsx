import * as Tooltip from "@radix-ui/react-tooltip";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccentSwitcher } from "./components/AccentSwitcher";
import { AgentPicker } from "./components/AgentPicker";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { ConfigPanel } from "./components/config/ConfigPanel";
import { DoctorPanel } from "./components/DoctorPanel";
import { HandoffPanel } from "./components/handoff/HandoffPanel";
import { Icon } from "./components/Icon";
import { OnboardingCard } from "./components/OnboardingCard";
import { OnboardingTour } from "./components/OnboardingTour";
import { ProfilePanel } from "./components/profile/ProfilePanel";
import { RunView } from "./components/RunView";
import { TabBar, type TabDef } from "./components/TabBar";
import { Toasts } from "./components/Toasts";
import { useAgentStream } from "./hooks/useAgentStream";
import { listAgents } from "./ipc";
import { useCanonical } from "./state/canonical";
import { runImportWizard } from "./state/importConfig";
import {
  getPreset,
  loadPresets,
  savePresets,
  type PermissionPreset,
  type PermissionPresetMap,
} from "./state/permissionPresets";
import { PANEL_ENTER, PANEL_EXIT } from "./state/motion";
import { load, save } from "./state/persist";
import { applyAccentValue, type AccentValue } from "./state/theme";
import { useToast } from "./state/toast";
import type { AgentInfo } from "./types";

const TABS: TabDef[] = [
  { id: "run", label: "Run", icon: "cpu" },
  { id: "config", label: "Config", icon: "config" },
  { id: "handoff", label: "Handoff", icon: "handoff" },
  { id: "profile", label: "Profile", icon: "user" },
];

export default function App() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  // Agent + working dir survive a relaunch — they're the first thing typed every
  // session, and everything else here (tab, accent, presets, canonical) already
  // persists. A stale agent id is re-validated against the live list on refresh.
  const [selected, setSelected] = useState<string>(() => load<string>("settings.agent", ""));
  const [cwd, setCwd] = useState<string>(() => load<string>("settings.cwd", ""));
  useEffect(() => {
    save("settings.agent", selected);
  }, [selected]);
  useEffect(() => {
    save("settings.cwd", cwd);
  }, [cwd]);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(() => load<string>("settings.tab", "run"));
  useEffect(() => {
    save("settings.tab", tab);
  }, [tab]);

  // Per-project permission preset (FR31) — a flat map keyed by cwd, matching how
  // the rest of this app treats "project" (no general project-scoping concept yet).
  const [presets, setPresets] = useState<PermissionPresetMap>(() => loadPresets());
  useEffect(() => {
    savePresets(presets);
  }, [presets]);
  const projectKey = cwd.trim();
  const preset = getPreset(presets, projectKey);
  const setPreset = (p: PermissionPreset) => {
    setPresets((prev) => ({ ...prev, [projectKey]: p }));
  };

  const stream = useAgentStream();
  const toast = useToast();
  const canonical = useCanonical();

  // Import wizard (FR26): single-click ingest of whatever native MCP/instructions
  // files already exist under `cwd` into the canonical store, so a user with an
  // existing Claude/Codex/Cursor setup doesn't have to hand-type everything into
  // the Config tab. Best-effort per file — reported via toast, never a modal.
  const [importing, setImporting] = useState(false);
  const importConfig = useCallback(async () => {
    setImporting(true);
    // Immediate pending affordance — the palette closes on run, and the only
    // other "Importing…" label lives on the (dismissable) onboarding card.
    toast.push("info", `Importing existing config from ${cwd.trim()}…`);
    try {
      const { imported } = await runImportWizard({
        cwd: cwd.trim(),
        servers: canonical.servers,
        instructions: canonical.instructions.markdown,
        setServers: canonical.setServers,
        setInstructions: canonical.setInstructions,
        toast: toast.push,
      });
      // The result materializes in the Config tab — go where the outcome is
      // instead of reporting success toward an off-screen surface.
      if (imported) setTab("config");
    } finally {
      setImporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, canonical.servers, canonical.instructions.markdown, canonical.setServers, canonical.setInstructions, toast]);

  // Re-pollable so the onboarding/tour instruction ("set the key or log in via
  // the CLI, then re-check") is actually completable — auth can change without
  // relaunching the app. Keeps the user's current pick; only defaults when unset.
  const refreshAgents = useCallback(() => {
    return listAgents()
      .then((list) => {
        setAgents(list);
        setConnectError(null);
        // Keep the user's pick only if it still exists in the registry (it may
        // be a persisted id from a previous launch); otherwise fall back.
        setSelected((cur) =>
          cur && list.some((a) => a.id === cur) ? cur : (list[0]?.id ?? ""),
        );
      })
      .catch((e) => setConnectError(String(e)));
  }, []);
  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  const connect = async () => {
    const name = agents.find((a) => a.id === selected)?.displayName ?? selected;
    setConnecting(true);
    setConnectError(null);
    try {
      await stream.connect(selected, cwd.trim());
      toast.push("success", `Connected to ${name}`);
    } catch (e) {
      setConnectError(String(e));
      toast.push("error", `Couldn't connect to ${name}`);
    } finally {
      setConnecting(false);
    }
  };

  const connected = stream.session !== null;
  const hasProfile = load<unknown[]>("profiles", []).length > 0;

  // A connect failure the core classified as auth-related (`AUTH_REQUIRED:<agent>:<detail>`
  // from commands.rs) — reframe it as an actionable "sign in to your agent" notice
  // rather than a generic runtime error, without inventing detail.
  const authInfo = (() => {
    if (!connectError?.startsWith("AUTH_REQUIRED:")) return null;
    const rest = connectError.slice("AUTH_REQUIRED:".length);
    const i = rest.indexOf(":");
    return { agent: i >= 0 ? rest.slice(0, i) : rest, detail: i >= 0 ? rest.slice(i + 1) : "" };
  })();
  const authAgentName = authInfo
    ? (agents.find((a) => a.id === authInfo.agent)?.displayName ?? authInfo.agent)
    : "";

  const [onboardingDismissed, setOnboardingDismissed] = useState(() =>
    load<boolean>("settings.onboardingDismissed", false),
  );
  useEffect(() => {
    save("settings.onboardingDismissed", onboardingDismissed);
  }, [onboardingDismissed]);

  // First-launch guided walkthrough (UI-FR28). Opens once automatically, then
  // stays replayable forever via the command palette and the header info button.
  const [tourCompleted, setTourCompleted] = useState(() =>
    load<boolean>("settings.tourCompleted", false),
  );
  const [tourOpen, setTourOpen] = useState(() => !load<boolean>("settings.tourCompleted", false));
  useEffect(() => {
    save("settings.tourCompleted", tourCompleted);
  }, [tourCompleted]);
  const closeTour = () => {
    setTourOpen(false);
    setTourCompleted(true);
  };

  // Preset name or a custom "#rrggbb" from the color picker — same storage key,
  // so accents persisted before the picker existed load unchanged.
  const [accent, setAccent] = useState<AccentValue>(() =>
    load<AccentValue>("settings.accent", "emerald"),
  );
  useEffect(() => {
    applyAccentValue(accent);
    save("settings.accent", accent);
  }, [accent]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);

  const commands = useMemo<Command[]>(() => {
    const selectedName = agents.find((a) => a.id === selected)?.displayName ?? selected;
    const needCwd = !cwd.trim() ? "set a working directory first" : undefined;
    // Presets are per-project — say which project the command will affect
    // rather than silently keying on an invisible cwd.
    const presetScope = cwd.trim() ? ` for ${cwd.trim()}` : "";
    const cmds: Command[] = [
      { id: "tab-run", label: "Go to Run", hint: "1", run: () => setTab("run") },
      { id: "tab-config", label: "Go to Config", hint: "2", run: () => setTab("config") },
      // Labeled as the task the PRD names (UI-NFR4: "start a handoff", "run a
      // profile", "generate a continuity report"), not just the tab name — same
      // real navigation, found under the vocabulary a user actually thinks in.
      { id: "tab-handoff", label: "Start a handoff", hint: "3", run: () => setTab("handoff") },
      { id: "tab-profile", label: "Run a profile", hint: "4", run: () => setTab("profile") },
      { id: "continuity-report", label: "Generate a continuity report", run: () => setTab("profile") },
      { id: "replay-tour", label: "Replay walkthrough", run: () => setTourOpen(true) },
      { id: "run-doctor", label: "Run doctor diagnostics", run: () => setDoctorOpen(true) },
      { id: "recheck-agents", label: "Re-check agent auth", run: () => void refreshAgents() },
    ];
    if (connected) {
      cmds.push({
        id: "disconnect",
        label: `Disconnect from ${stream.agentId ? (agents.find((a) => a.id === stream.agentId)?.displayName ?? stream.agentId) : "the agent"}`,
        run: stream.disconnect,
      });
    } else {
      cmds.push({
        id: "connect",
        label: `Connect to ${selectedName || "an agent"}`,
        run: connect,
        disabledReason: !selected ? "no agent available" : needCwd,
      });
    }
    if (stream.turnActive) {
      cmds.push({ id: "cancel", label: "Cancel current turn", hint: "Esc", run: () => stream.cancel() });
    }
    cmds.push({
      id: "import-config",
      label: "Import existing config",
      run: () => void importConfig(),
      disabledReason: importing ? "import in progress…" : needCwd,
    });
    if (onboardingDismissed) {
      cmds.push({
        id: "show-checklist",
        label: "Show setup checklist",
        run: () => {
          setOnboardingDismissed(false);
          setTab("run");
        },
      });
    }
    cmds.push({
      id: "preset-default",
      label: `Set permission preset: Ask every time${presetScope}`,
      run: () => setPresets((prev) => ({ ...prev, [cwd.trim()]: "default" })),
      disabledReason: needCwd,
    });
    cmds.push({
      id: "preset-accept-edits",
      label: `Set permission preset: Auto-accept edits${presetScope}`,
      run: () => setPresets((prev) => ({ ...prev, [cwd.trim()]: "acceptEdits" })),
      disabledReason: needCwd,
    });
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, connected, selected, cwd, stream.turnActive, stream.agentId, importing, importConfig, setPresets, onboardingDismissed, refreshAgents]);

  // Global shortcuts (UI-FR32): ⌘/Ctrl-K toggles the palette; Esc closes it or
  // cancels an in-flight turn; number keys switch tabs when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While the tour is open it drives tabs itself — don't let the palette
      // shortcut or number-key tab switches fight it. Escape still closes the
      // tour (Radix's own Dialog listener handles that independently).
      if (tourOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        // Radix closes the doctor dialog on its own Escape — don't ALSO cancel
        // a live agent turn from a keypress aimed at a diagnostics modal.
        if (doctorOpen) return;
        if (stream.turnActive) void stream.cancel();
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const map: Record<string, string> = { "1": "run", "2": "config", "3": "handoff", "4": "profile" };
        if (map[e.key]) setTab(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, doctorOpen, stream, tourOpen]);

  return (
    <MotionConfig reducedMotion="user">
    <>
    <div className="app app-bg">
      <header className="app-header">
        <div className="app-title">
          <span className="app-mark" aria-hidden="true" />
          <h1>Agent Bridge</h1>
          <AccentSwitcher accent={accent} onChange={setAccent} />
          {/* Grouped as one functional toolbar, visually distinct from the
              cosmetic accent switcher above — three unrelated icon buttons in a
              row otherwise read as one undifferentiated cluster. */}
          <div className="header-actions">
            <Tooltip.Provider delayDuration={400}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className="palette-trigger"
                    onClick={() => setPaletteOpen(true)}
                    aria-label="Open command palette"
                  >
                    <kbd className="kbd">⌘K</kbd>
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content asChild side="bottom" sideOffset={6}>
                    <motion.div
                      className="tooltip-content"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      Command palette
                    </motion.div>
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
            <Tooltip.Provider delayDuration={400}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className="palette-trigger"
                    onClick={() => setTourOpen(true)}
                    aria-label="Replay walkthrough"
                  >
                    <Icon name="info" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content asChild side="bottom" sideOffset={6}>
                    <motion.div
                      className="tooltip-content"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      Replay walkthrough
                    </motion.div>
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
            <Tooltip.Provider delayDuration={400}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className="palette-trigger"
                    onClick={() => setDoctorOpen(true)}
                    aria-label="Run doctor diagnostics"
                  >
                    <Icon name="activity" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content asChild side="bottom" sideOffset={6}>
                    <motion.div
                      className="tooltip-content"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      Doctor diagnostics
                    </motion.div>
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
        </div>
        <AgentPicker
          agents={agents}
          selected={selected}
          cwd={cwd}
          disabled={connected || connecting}
          connecting={connecting}
          connected={connected}
          preset={preset}
          hasConversation={stream.messages.length > 0}
          onSelect={setSelected}
          onCwdChange={setCwd}
          onConnect={connect}
          onDisconnect={stream.disconnect}
          onRecheck={refreshAgents}
          onPresetChange={setPreset}
          onGoToHandoff={() => setTab("handoff")}
        />
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </header>

      <AnimatePresence initial={false}>
      {connectError && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{ overflow: "hidden" }}
        >
        <div className="banner banner-error" role="alert">
          <Icon name="alert" />
          <div className="banner-body">
            <strong>
              {authInfo ? `Sign in to ${authAgentName} to connect` : "Couldn't reach the agent runtime."}
            </strong>
            {authInfo && (
              <span>
                No Agent Bridge key needed — sign in to {authAgentName} via its own subscription or
                CLI login, then reconnect.
              </span>
            )}
            <code className="banner-detail">{authInfo ? authInfo.detail : connectError}</code>
          </div>
          <button
            className="banner-close"
            aria-label="Dismiss error"
            onClick={() => setConnectError(null)}
          >
            <Icon name="x" />
          </button>
        </div>
        </motion.div>
      )}
      </AnimatePresence>

      <main className="app-main">
        <AnimatePresence mode="wait">
          {/* Fade-through: fast ease-in exit, slower ease-out entry — motion
              concentrates in the persistent tab pill, panels just swap. The
              className continues the flex/min-height chain so each panel (and
              the Run tab's thread) scrolls internally under fixed chrome. */}
          <motion.div
            key={tab}
            className="tab-panel"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: PANEL_ENTER }}
            exit={{ opacity: 0, transition: PANEL_EXIT }}
          >
            {tab === "run" && (
              <div className="panel">
                <AnimatePresence>
                  {!onboardingDismissed && !tourOpen && (
                    <OnboardingCard
                      agents={agents}
                      connected={connected}
                      hasProfile={hasProfile}
                      canImport={cwd.trim().length > 0}
                      importing={importing}
                      onGoConfig={() => setTab("config")}
                      onGoProfile={() => setTab("profile")}
                      onRecheck={refreshAgents}
                      onImportConfig={importConfig}
                      onDismiss={() => setOnboardingDismissed(true)}
                    />
                  )}
                </AnimatePresence>
                <RunView stream={stream} agents={agents} />
              </div>
            )}

            {tab === "config" && (
              <div className="panel">
                <ConfigPanel cwd={cwd} />
              </div>
            )}

            {tab === "handoff" && (
              <div className="panel">
                <HandoffPanel
                  stream={stream}
                  agents={agents}
                  cwd={cwd}
                  onSwitched={(newCwd) => {
                    setCwd(newCwd);
                    setTab("run");
                  }}
                  onGoRun={() => setTab("run")}
                />
              </div>
            )}

            {tab === "profile" && (
              <div className="panel">
                <ProfilePanel stream={stream} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
    <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
    <OnboardingTour open={tourOpen} onClose={closeTour} tab={tab} onTabChange={setTab} />
    <DoctorPanel open={doctorOpen} onClose={() => setDoctorOpen(false)} />
    <Toasts />
    </>
    </MotionConfig>
  );
}
