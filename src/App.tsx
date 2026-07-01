import { useEffect, useMemo, useState } from "react";
import { AccentSwitcher } from "./components/AccentSwitcher";
import { AgentPicker } from "./components/AgentPicker";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { ConfigPanel } from "./components/config/ConfigPanel";
import { HandoffPanel } from "./components/handoff/HandoffPanel";
import { Icon } from "./components/Icon";
import { OnboardingCard } from "./components/OnboardingCard";
import { ProfilePanel } from "./components/profile/ProfilePanel";
import { RunView } from "./components/RunView";
import { TabBar, type TabDef } from "./components/TabBar";
import { Toasts } from "./components/Toasts";
import { useAgentStream } from "./hooks/useAgentStream";
import { listAgents } from "./ipc";
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

  useEffect(() => {
    listAgents()
      .then((list) => {
        setAgents(list);
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch((e) => setConnectError(String(e)));
  }, []);

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

  const [onboardingDismissed, setOnboardingDismissed] = useState(() =>
    load<boolean>("settings.onboardingDismissed", false),
  );
  useEffect(() => {
    save("settings.onboardingDismissed", onboardingDismissed);
  }, [onboardingDismissed]);

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
    ];
    if (!connected && selected && cwd.trim()) {
      cmds.push({ id: "connect", label: `Connect to ${selected}`, run: connect });
    }
    if (stream.turnActive) {
      cmds.push({ id: "cancel", label: "Cancel current turn", hint: "Esc", run: () => stream.cancel() });
    }
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, selected, cwd, stream.turnActive]);

  // Global shortcuts (UI-FR32): ⌘/Ctrl-K toggles the palette; Esc closes it or
  // cancels an in-flight turn; number keys switch tabs when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [paletteOpen, stream]);

  return (
    <>
    <div className="app app-bg">
      <header className="app-header">
        <div className="app-title">
          <span className="app-mark" aria-hidden="true" />
          <h1>Agent Bridge</h1>
          <AccentSwitcher accent={accent} onChange={setAccent} />
          <button
            className="palette-trigger"
            onClick={() => setPaletteOpen(true)}
            title="Command palette"
            aria-label="Open command palette"
          >
            <kbd className="kbd">⌘K</kbd>
          </button>
        </div>
        <AgentPicker
          agents={agents}
          selected={selected}
          cwd={cwd}
          disabled={connected || connecting}
          connecting={connecting}
          onSelect={setSelected}
          onCwdChange={setCwd}
          onConnect={connect}
        />
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </header>

      {connectError && (
        <div className="banner banner-error" role="alert">
          <Icon name="alert" />
          <div className="banner-body">
            <strong>Couldn't reach the agent runtime.</strong>
            <code className="banner-detail">{connectError}</code>
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
        {tab === "run" && (
          <div className="panel">
            {!onboardingDismissed && (
              <OnboardingCard
                agents={agents}
                connected={connected}
                hasProfile={hasProfile}
                onGoConfig={() => setTab("config")}
                onGoProfile={() => setTab("profile")}
                onDismiss={() => setOnboardingDismissed(true)}
              />
            )}
            <RunView stream={stream} />
          </div>
        )}

        {tab === "config" && (
          <div className="panel">
            <ConfigPanel />
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
      </main>
    </div>
    <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
    <Toasts />
    </>
  );
}
