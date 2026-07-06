import { useEffect, useMemo, useState } from "react";
import type { AgentStream } from "../../hooks/useAgentStream";
import type { ContextSnapshot } from "../../engineTypes";
import { useCanonical } from "../../state/canonical";
import { load, save } from "../../state/persist";
import { useToast } from "../../state/toast";
import type { AgentInfo } from "../../types";
import { estimateTokens, formatTokens, TOKEN_ESTIMATE_NOTE } from "../../state/tokenEstimate";
import { AgentLogo } from "../AgentLogo";
import { Icon } from "../Icon";
import { PanelEmpty } from "../PanelEmpty";
import { CarryDiff } from "./CarryDiff";
import { draftFieldNames, parseSnapshotDraft, SNAPSHOT_DRAFT_PROMPT } from "./draftFromAgent";
import { EditsEditor, StringListEditor, TaskListEditor } from "./snapshotEditors";

// Handoff Bridge panel (UI-FR16–18). Assemble a snapshot from the live session,
// review the carry-diff, then hand off via a reconstructed brief. Nothing here
// implies the memory migrated — the switch opens a fresh session primed with a brief.

const DRAFT_KEY = "handoff.draft";

interface HandoffDraft {
  target: string;
  workingDirectory: string;
  openFiles: string[];
  taskList: { text: string; status: "pending" | "inProgress" | "completed" }[];
  recentEdits: { file: string; hunkSummary: string }[];
  decisions: string[];
  conversationSummary: string;
  activeMcp: string[];
  activeSkills: string[];
}
export function HandoffPanel({
  stream,
  agents,
  cwd,
  onSwitched,
  onGoRun,
}: {
  stream: AgentStream;
  agents: AgentInfo[];
  cwd: string;
  onSwitched: (cwd: string) => void;
  onGoRun: () => void;
}) {
  const store = useCanonical();
  const toast = useToast();
  const source = stream.agentId;

  // The snapshot is the most hand-typed surface in the app, and this panel
  // unmounts on every tab switch — which the flow actively invites ("seed from
  // thread", checking the Run thread mid-assembly). Draft-persist every field so
  // leaving the tab never destroys work; cleared only on a successful switch.
  const [draft] = useState(() => load<Partial<HandoffDraft>>(DRAFT_KEY, {}));
  const [target, setTarget] = useState<string>(() =>
    draft.target && draft.target !== source
      ? draft.target
      : (agents.find((a) => a.id !== source)?.id ?? ""),
  );
  const [workingDirectory, setWorkingDirectory] = useState(draft.workingDirectory ?? cwd);
  const [openFiles, setOpenFiles] = useState<string[]>(draft.openFiles ?? []);
  const [taskList, setTaskList] = useState<{ text: string; status: "pending" | "inProgress" | "completed" }[]>(draft.taskList ?? []);
  const [recentEdits, setRecentEdits] = useState<{ file: string; hunkSummary: string }[]>(draft.recentEdits ?? []);
  const [decisions, setDecisions] = useState<string[]>(draft.decisions ?? []);
  const [conversationSummary, setConversationSummary] = useState(draft.conversationSummary ?? "");
  const [activeMcp, setActiveMcp] = useState<string[]>(
    () => draft.activeMcp ?? store.servers.filter((s) => !s.disabled).map((s) => s.name),
  );
  const [activeSkills, setActiveSkills] = useState<string[]>(draft.activeSkills ?? []);

  // Agent-drafted snapshot state (see runDraft below). `draftAsk` is the
  // upfront-cost confirm step — the prompt is never sent on the first click.
  const [draftAsk, setDraftAsk] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const sourceName = agents.find((a) => a.id === source)?.displayName ?? source ?? "the agent";

  useEffect(() => {
    save<HandoffDraft>(DRAFT_KEY, {
      target,
      workingDirectory,
      openFiles,
      taskList,
      recentEdits,
      decisions,
      conversationSummary,
      activeMcp,
      activeSkills,
    });
  }, [target, workingDirectory, openFiles, taskList, recentEdits, decisions, conversationSummary, activeMcp, activeSkills]);

  const snapshot = useMemo<ContextSnapshot>(
    () => ({
      sourceAgent: source ?? "",
      targetAgent: target,
      timestamp: new Date().toISOString(),
      workingDirectory,
      openFiles: openFiles.filter(Boolean),
      taskList: taskList.filter((t) => t.text),
      recentEdits: recentEdits.filter((e) => e.file),
      decisions: decisions.filter(Boolean),
      conversationSummary,
      activeMcp: activeMcp.filter(Boolean),
      activeSkills: activeSkills.filter(Boolean),
    }),
    [source, target, workingDirectory, openFiles, taskList, recentEdits, decisions, conversationSummary, activeMcp, activeSkills],
  );

  if (stream.session === null) {
    return (
      <PanelEmpty
        icon="handoff"
        title="No active session to hand off from"
        hint="Connect an agent in the Run tab first, then come back to carry its context to another agent."
      >
        <button className="btn btn-sm" onClick={onGoRun}>
          <Icon name="cpu" /> Go to Run tab
        </button>
      </PanelEmpty>
    );
  }

  const targetInfo = agents.find((a) => a.id === target);
  const targetErrored = targetInfo?.authStatus === "error";
  const canSwitch =
    !!target && target !== source && !!workingDirectory.trim() && !targetErrored;
  // Visible, AT-reachable reason the switch is blocked (the button's title alone
  // is invisible to keyboard/touch/screen-reader users, and the fix — the
  // working-dir field — lives in the other column).
  const blockedReason =
    !target || target === source
      ? "Pick a target agent different from the source."
      : !workingDirectory.trim()
        ? "Set a working directory in the snapshot panel to enable switching."
        : targetErrored
          ? "Resolve the target agent's error above first."
          : null;

  const seedFromThread = () => {
    const full = stream.messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.text)
      .join("\n\n");
    const truncated = full.length > 1200;
    setConversationSummary(full.slice(0, 1200));
    // The stream already recorded every resolved edit as a system message —
    // seed recentEdits from those instead of asking the user to re-type them.
    const edits = stream.messages
      .filter((m) => m.role === "system")
      .map((m) => /^(?:Auto-a|A)pplied edit to (.+?)(?: \(acceptEdits preset\))?$/.exec(m.text)?.[1])
      .filter((f): f is string => !!f)
      .map((file) => ({ file, hunkSummary: "edit applied this session" }));
    if (edits.length > 0 && recentEdits.filter((e) => e.file).length === 0) {
      setRecentEdits(edits);
    }
    toast.push(
      "info",
      truncated
        ? `Seeded the first 1200 characters (thread is longer — trim/edit before switching)${edits.length ? ` and ${edits.length} applied edit(s)` : ""}`
        : `Seeded the summary from the thread${edits.length ? ` and ${edits.length} applied edit(s)` : ""}`,
    );
  };

  // Agent-drafted snapshot: the app prompts the OUTGOING agent, in its live
  // session over the same `promptCapture` transport the profile run uses, to
  // draft the snapshot fields. The reply crosses the boundary parser in
  // draftFromAgent.ts, and the user still reviews/edits everything before the
  // (unchanged) blocking carry-diff. Because this really sends a prompt, the
  // cost is stated upfront and the run needs an explicit go.
  const runDraft = async () => {
    setDraftAsk(false);
    setDraftError(null);
    setDrafting(true);
    try {
      const reply = await stream.promptCapture(SNAPSHOT_DRAFT_PROMPT);
      const parsed = parseSnapshotDraft(reply);
      const filled = parsed ? draftFieldNames(parsed) : [];
      if (!parsed || filled.length === 0) {
        setDraftError(
          parsed
            ? "The agent returned an empty draft — fill the snapshot manually."
            : "The reply contained no usable JSON draft — fill the snapshot manually.",
        );
        return;
      }
      if (parsed.conversationSummary) setConversationSummary(parsed.conversationSummary);
      if (parsed.taskList) setTaskList(parsed.taskList);
      if (parsed.decisions) setDecisions(parsed.decisions);
      if (parsed.openFiles) setOpenFiles(parsed.openFiles);
      if (parsed.recentEdits) setRecentEdits(parsed.recentEdits);
      toast.push(
        "success",
        `Draft from ${sourceName} filled ${filled.join(", ")} — review before switching`,
      );
    } catch (e) {
      setDraftError(String(e));
    } finally {
      setDrafting(false);
    }
  };

  const doSwitch = async (brief: string) => {
    try {
      const newCwd = workingDirectory.trim();
      await stream.switchWithBrief(target, newCwd, brief);
      // The carried draft is spent — next handoff starts fresh.
      save<Partial<HandoffDraft>>(DRAFT_KEY, {});
      toast.push("success", `Switched to ${targetInfo?.displayName ?? target} — brief sent`);
      onSwitched(newCwd);
    } catch (e) {
      toast.push("error", `Handoff failed: ${e}`);
    }
  };

  return (
    <div className="handoff-panel">
      <div className="handoff-editor-col">
        <div className="glass-card">
          <h3 className="card-title">
            <Icon name="handoff" /> Assemble the snapshot
          </h3>
          <p className="card-sub">
            Carrying from{" "}
            <strong>
              <AgentLogo id={source ?? ""} /> {sourceName}
            </strong>
            . Trim or add anything before you switch — this is what gets reconstructed for the next
            agent.
          </p>

          <div className="draft-from-agent">
            <button
              className="btn btn-sm"
              onClick={() => setDraftAsk(true)}
              disabled={drafting || draftAsk || stream.turnActive}
            >
              <Icon name="sparkles" />{" "}
              {drafting ? `Asking ${sourceName}…` : `Draft with ${sourceName}`}
            </button>
            {!drafting && !draftAsk && (
              <span className="token-estimate">
                asks the live session to draft these fields as JSON
              </span>
            )}
          </div>
          {draftAsk && (
            <div className="callout callout-honesty">
              <Icon name="info" />
              <span>
                This sends ≈{formatTokens(estimateTokens(SNAPSHOT_DRAFT_PROMPT))} prompt tokens to{" "}
                {sourceName} in the live session ({TOKEN_ESTIMATE_NOTE}). The reply is a JSON draft
                that pre-fills the fields below for your review — nothing goes to the target agent
                yet.
                <span className="draft-confirm-actions">
                  <button className="btn btn-sm btn-primary" onClick={runDraft}>
                    <Icon name="send" /> Ask {sourceName}
                  </button>
                  <button className="btn btn-sm" onClick={() => setDraftAsk(false)}>
                    Cancel
                  </button>
                </span>
              </span>
            </div>
          )}
          {draftError && (
            <div className="callout callout-error">
              <Icon name="x" /> Draft failed: {draftError}
            </div>
          )}

          <div className="handoff-target-row" data-tour-step="handoff-target-row">
            <label className="field-inline">
              Switch to
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                {agents
                  .filter((a) => a.id !== source)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-inline">
              Working dir
              <input
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                placeholder="/path/to/project"
              />
            </label>
          </div>
          {targetErrored && (
            <div className="callout callout-error">
              <Icon name="alert" /> {targetInfo?.displayName} reports an error — resolve it before
              handing off.
            </div>
          )}

          <div className="snap-field">
            <div className="snap-field-head">
              <span>Conversation summary</span>
              <button className="btn btn-sm btn-ghost" onClick={seedFromThread}>
                <Icon name="sparkles" /> seed from thread
              </button>
            </div>
            <textarea
              className="ondisk-input"
              rows={4}
              placeholder="What was accomplished, where things stand, what's next."
              value={conversationSummary}
              onChange={(e) => setConversationSummary(e.target.value)}
            />
          </div>

          <TaskListEditor items={taskList} onChange={setTaskList} />
          <StringListEditor label="Decisions" items={decisions} placeholder="a decision made" onChange={setDecisions} />
          <StringListEditor label="Open files" items={openFiles} placeholder="path/to/file" onChange={setOpenFiles} />
          <EditsEditor items={recentEdits} onChange={setRecentEdits} />
          <StringListEditor label="Active MCP" items={activeMcp} placeholder="server name" onChange={setActiveMcp} />
          <StringListEditor label="Active skills" items={activeSkills} placeholder="skill name" onChange={setActiveSkills} />
        </div>
      </div>

      <div className="handoff-diff-col" data-tour-step="handoff-diff">
        <CarryDiff
          snapshot={snapshot}
          targetAgent={targetInfo?.displayName ?? target}
          canSwitch={canSwitch}
          blockedReason={blockedReason}
          onSwitch={doSwitch}
        />
      </div>
    </div>
  );
}
