import type { AgentStream } from "../hooks/useAgentStream";
import { DiffHunk } from "./DiffHunk";
import { Icon } from "./Icon";
import { PanelEmpty } from "./PanelEmpty";
import { PromptInput } from "./PromptInput";
import { ThreadView } from "./ThreadView";

// The unified run loop (FR2/FR3): one thread + per-hunk accept/reject + a Cancel
// that is reachable at all times during an in-flight turn (UI-NFR3). Identical for
// every agent — nothing here branches on which agent is connected.
export function RunView({ stream }: { stream: AgentStream }) {
  if (stream.session === null) {
    return (
      <PanelEmpty
        icon="cpu"
        title="No session yet"
        hint="Pick an agent and a working directory above, then Connect to start a session."
      />
    );
  }

  const composerDisabled = stream.turnActive || stream.pendingEdit !== null;

  return (
    <div className="run">
      <ThreadView messages={stream.messages} busy={stream.turnActive} />
      {stream.pendingEdit && <DiffHunk edit={stream.pendingEdit} onResolve={stream.resolve} />}
      <div className="composer" data-tour-step="composer">
        <PromptInput disabled={composerDisabled} onSend={stream.prompt} />
        {stream.turnActive && (
          <button
            className="btn btn-ghost btn-stop"
            onClick={stream.cancel}
            title="Cancel the in-flight turn"
          >
            <Icon name="stop" /> Stop
          </button>
        )}
      </div>
    </div>
  );
}
