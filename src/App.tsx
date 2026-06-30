import { useEffect, useState } from "react";
import { AgentPicker } from "./components/AgentPicker";
import { DiffHunk } from "./components/DiffHunk";
import { PromptInput } from "./components/PromptInput";
import { ThreadView } from "./components/ThreadView";
import { useAgentStream } from "./hooks/useAgentStream";
import { listAgents } from "./ipc";
import type { AgentInfo } from "./types";

export default function App() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [cwd, setCwd] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

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
    <div className="app">
      <header className="app-header">
        <h1>Agent Bridge</h1>
        <AgentPicker
          agents={agents}
          selected={selected}
          cwd={cwd}
          disabled={connected || connecting}
          onSelect={setSelected}
          onCwdChange={setCwd}
          onConnect={connect}
        />
      </header>

      {connectError && <div className="banner banner-error">{connectError}</div>}

      <main className="app-main">
        {connected ? (
          <>
            <ThreadView messages={stream.messages} />
            {stream.pendingEdit && (
              <DiffHunk edit={stream.pendingEdit} onResolve={stream.resolve} />
            )}
            <PromptInput
              disabled={stream.turnActive || stream.pendingEdit !== null}
              onSend={stream.prompt}
            />
          </>
        ) : (
          <p className="app-hint">
            Pick an agent and a working directory, then Connect to start a session.
          </p>
        )}
      </main>
    </div>
  );
}
