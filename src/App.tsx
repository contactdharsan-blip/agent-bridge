import { useEffect, useState } from "react";
import { AgentPicker } from "./components/AgentPicker";
import { ConfigPanel } from "./components/config/ConfigPanel";
import { HandoffPanel } from "./components/handoff/HandoffPanel";
import { ProfilePanel } from "./components/profile/ProfilePanel";
import { RunView } from "./components/RunView";
import { TabBar, type TabDef } from "./components/TabBar";
import { useAgentStream } from "./hooks/useAgentStream";
import { listAgents } from "./ipc";
import { CanonicalProvider } from "./state/canonical";
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
  const [tab, setTab] = useState<string>("run");

  const stream = useAgentStream();

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
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setConnecting(false);
    }
  };

  const connected = stream.session !== null;

  return (
    <CanonicalProvider>
    <div className="app app-bg">
      <header className="app-header">
        <div className="app-title">
          <span className="app-mark" aria-hidden="true" />
          <h1>Agent Bridge</h1>
        </div>
        <AgentPicker
          agents={agents}
          selected={selected}
          cwd={cwd}
          disabled={connected || connecting}
          onSelect={setSelected}
          onCwdChange={setCwd}
          onConnect={connect}
        />
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </header>

      {connectError && (
        <div className="banner banner-error" role="alert">
          {connectError}
        </div>
      )}

      <main className="app-main">
        {tab === "run" && <RunView stream={stream} />}

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
    </CanonicalProvider>
  );
}
