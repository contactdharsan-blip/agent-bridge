import * as Tooltip from "@radix-ui/react-tooltip";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccentSwitcher } from "./components/AccentSwitcher";
import { AgentPicker } from "./components/AgentPicker";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { ConfigPanel } from "./components/config/ConfigPanel";
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
import { load, save } from "./state/persist";
import { applyAccent, type AccentName } from "./state/theme";
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
  const [selected, setSelected] = useState<string>("");
  const [cwd, setCwd] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(() => load<string>("settings.tab", "run"));
  useEffect(() => {
    save("settings.tab", tab);
  }, [tab]);

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
    try {
      await runImportWizard({
        cwd: cwd.trim(),
        servers: canonical.servers,
        setServers: canonical.setServers,
        setInstructions: canonical.setInstructions,
        toast: toast.push,
      });
    } finally {
      setImporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, canonical.servers, canonical.setServers, canonical.setInstructions, toast]);

  // Re-pollable so the onboarding/tour instruction ("set the key or log in via
  // the CLI, then re-check") is actually completable — auth can change without
  // relaunching the app. Keeps the user's current pick; only defaults when unset.
  const refreshAgents = useCallback(() => {
    return listAgents()
      .then((list) => {
        setAgents(list);
        setConnectError(null);
        setSelected((cur) => cur || list[0]?.id || "");
      })
      .catch((e) => setConnectError(String(e)));
  }, []);
  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  const connect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      await stream.connect(selected, cwd.trim());
      toast.push("success", `Connected to ${selected}`);
    } catch (e) {
      setConnectError(String(e));
      toast.push("error", `Couldn't connect to ${selected}`);
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

  const [accent, setAccent] = useState<AccentName>(() =>
    load<AccentName>("settings.accent", "emerald"),
  );
  useEffect(() => {
    applyAccent(accent);
    save("settings.accent", accent);
  }, [accent]);

  const [paletteOpen, setPaletteOpen] = useState(false);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      { id: "tab-run", label: "Go to Run", hint: "1", run: () => setTab("run") },
      { id: "tab-config", label: "Go to Config", hint: "2", run: () => setTab("config") },
      { id: "tab-handoff", label: "Go to Handoff", hint: "3", run: () => setTab("handoff") },
      { id: "tab-profile", label: "Go to Profile", hint: "4", run: () => setTab("profile") },
      { id: "replay-tour", label: "Replay walkthrough", run: () => setTourOpen(true) },
    ];
    if (!connected && selected && cwd.trim()) {
      cmds.push({ id: "connect", label: `Connect to ${selected}`, run: connect });
    }
    if (stream.turnActive) {
      cmds.push({ id: "cancel", label: "Cancel current turn", hint: "Esc", run: () => stream.cancel() });
    }
    if (cwd.trim() && !importing) {
      cmds.push({
        id: "import-config",
        label: "Import existing config",
        run: () => void importConfig(),
      });
    }
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, selected, cwd, stream.turnActive, importing, importConfig]);

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
  }, [paletteOpen, stream, tourOpen]);

  return (
    <MotionConfig reducedMotion="user">
    <>
    <div className="app app-bg">
      <header className="app-header">
        <div className="app-title">
          <span className="app-mark" aria-hidden="true" />
          <h1>Agent Bridge</h1>
          <AccentSwitcher accent={accent} onChange={setAccent} />
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
        </div>
        <AgentPicker
          agents={agents}
          selected={selected}
          cwd={cwd}
          disabled={connected || connecting}
          connecting={connecting}
          connected={connected}
          onSelect={setSelected}
          onCwdChange={setCwd}
          onConnect={connect}
          onDisconnect={stream.disconnect}
          onRecheck={refreshAgents}
        />
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </header>

      {connectError && (
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
      )}

      <main className="app-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
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
                <RunView stream={stream} />
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
                  onSwitched={() => setTab("run")}
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
    <Toasts />
    </>
    </MotionConfig>
  );
}
