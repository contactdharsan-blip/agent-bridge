import { AnimatePresence, motion } from "framer-motion";
import type { AgentStream } from "../hooks/useAgentStream";
import { FADE } from "../state/motion";
import type { AgentInfo } from "../types";
import { DiffHunk } from "./DiffHunk";
import { Icon } from "./Icon";
import { PanelEmpty } from "./PanelEmpty";
import { PermissionAsk } from "./PermissionAsk";
import { PromptInput } from "./PromptInput";
import { ThreadView } from "./ThreadView";

// The unified run loop (FR2/FR3): one thread + per-hunk accept/reject + a Cancel
// that is reachable at all times during an in-flight turn (UI-NFR3). Identical for
// every agent — nothing here branches on which agent is connected.
export function RunView({ stream, agents }: { stream: AgentStream; agents?: AgentInfo[] }) {
  const disconnected = stream.session === null;
  // Only a truly empty state gets the empty panel — after a disconnect the
  // transcript is deliberately kept on screen (read-only) until the next connect.
  if (disconnected && stream.messages.length === 0) {
    return (
      <PanelEmpty
        icon="cpu"
        title="No session yet"
        hint="Pick an agent and a working directory above, then Connect to start a session."
      />
    );
  }

  const composerDisabled =
    stream.turnActive || stream.pendingEdit !== null || stream.pendingPermission !== null;
  // The three paused states ask for different behavior (wait vs act) — say which.
  const pausedReason = stream.pendingEdit
    ? "Review the pending edit above — accept or reject it to continue."
    : stream.pendingPermission
      ? "The agent is waiting for approval above — approve or deny it to continue."
      : stream.turnActive
        ? "The agent is responding — Stop interrupts it."
        : undefined;
  const agentName = (id: string) => agents?.find((a) => a.id === id)?.displayName ?? id;

  return (
    <div className="run">
      <ThreadView messages={stream.messages} busy={stream.turnActive} agentName={agentName} />
      {/* Entrance fade is surface-only: the gate itself stays blocking and
          non-dismissable — the composer is already disabled the same instant. */}
      <AnimatePresence>
        {stream.pendingEdit && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          >
            <DiffHunk edit={stream.pendingEdit} onResolve={stream.resolve} />
          </motion.div>
        )}
        {stream.pendingPermission && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          >
            <PermissionAsk permission={stream.pendingPermission} onResolve={stream.resolvePermissionRequest} />
          </motion.div>
        )}
      </AnimatePresence>
      {disconnected ? (
        <p className="thread-empty">
          Session ended — the thread above is kept for reference. Connect above to start fresh.
        </p>
      ) : (
        <div className="composer" data-tour-step="composer">
          <PromptInput disabled={composerDisabled} pausedReason={pausedReason} onSend={stream.prompt} />
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
      )}
    </div>
  );
}
