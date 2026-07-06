import type { TaskStatus } from "../../engineTypes";
import { extractJson } from "../profile/profileRun";

// Agent-drafted snapshot: instead of hand-typing the whole ContextSnapshot, the
// app prompts the OUTGOING agent — in its live session, over ACP stdio, the
// same `promptCapture` transport the profile run uses — to summarize what it
// knows into a JSON draft. The draft only pre-fills the same editable fields
// the user already reviews; the blocking carry-diff acknowledgement downstream
// is untouched. Everything the agent returns crosses this boundary parser:
// closed enums, type guards, size caps — non-conforming entries are dropped,
// never coerced, so a chatty or confabulating reply can't quietly corrupt the
// snapshot (same discipline as validate_profile).

export const SNAPSHOT_DRAFT_PROMPT = `Summarize the current session state for a handoff to another coding agent. Reply with ONLY a JSON object (no prose, no code fences) with these fields, omitting any you have no information for:
{
  "conversationSummary": "what was accomplished, where things stand, what's next",
  "taskList": [{ "text": "task", "status": "pending|inProgress|completed" }],
  "decisions": ["a decision made this session"],
  "openFiles": ["path/relative/to/project"],
  "recentEdits": [{ "file": "path", "hunkSummary": "what changed" }]
}
Only include things that actually happened in this session — do not invent state.`;

export interface SnapshotDraft {
  conversationSummary?: string;
  taskList?: { text: string; status: TaskStatus }[];
  decisions?: string[];
  openFiles?: string[];
  recentEdits?: { file: string; hunkSummary: string }[];
}

const MAX_ITEMS = 20;
const MAX_ITEM_CHARS = 300;
const MAX_SUMMARY_CHARS = 2000;
const STATUSES: TaskStatus[] = ["pending", "inProgress", "completed"];

const asTrimmedString = (v: unknown, cap: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, cap) : null;

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((s) => asTrimmedString(s, MAX_ITEM_CHARS))
    .filter((s): s is string => s !== null)
    .slice(0, MAX_ITEMS);
  return out.length > 0 ? out : undefined;
}

/** Parse an agent reply into a SnapshotDraft. Returns null when there is no
 * parseable JSON object at all; otherwise an object holding only the fields
 * that survived validation (possibly none). */
export function parseSnapshotDraft(text: string): SnapshotDraft | null {
  const json = extractJson(text);
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const draft: SnapshotDraft = {};

  const summary = asTrimmedString(o.conversationSummary, MAX_SUMMARY_CHARS);
  if (summary) draft.conversationSummary = summary;

  if (Array.isArray(o.taskList)) {
    const tasks = o.taskList
      .map((t) => {
        if (typeof t !== "object" || t === null) return null;
        const item = t as Record<string, unknown>;
        const text = asTrimmedString(item.text, MAX_ITEM_CHARS);
        // Closed enum, no coercion: an entry with an invented status is the
        // agent guessing — drop it rather than mislabel it "pending".
        if (!text || !STATUSES.includes(item.status as TaskStatus)) return null;
        return { text, status: item.status as TaskStatus };
      })
      .filter((t): t is { text: string; status: TaskStatus } => t !== null)
      .slice(0, MAX_ITEMS);
    if (tasks.length > 0) draft.taskList = tasks;
  }

  const decisions = stringList(o.decisions);
  if (decisions) draft.decisions = decisions;

  const openFiles = stringList(o.openFiles);
  if (openFiles) draft.openFiles = openFiles;

  if (Array.isArray(o.recentEdits)) {
    const edits = o.recentEdits
      .map((e) => {
        if (typeof e !== "object" || e === null) return null;
        const item = e as Record<string, unknown>;
        const file = asTrimmedString(item.file, MAX_ITEM_CHARS);
        if (!file) return null;
        return { file, hunkSummary: asTrimmedString(item.hunkSummary, MAX_ITEM_CHARS) ?? "" };
      })
      .filter((e): e is { file: string; hunkSummary: string } => e !== null)
      .slice(0, MAX_ITEMS);
    if (edits.length > 0) draft.recentEdits = edits;
  }

  return draft;
}

/** Which fields a parsed draft would fill — for the honest post-fill report. */
export function draftFieldNames(d: SnapshotDraft): string[] {
  const names: string[] = [];
  if (d.conversationSummary) names.push("summary");
  if (d.taskList) names.push(`${d.taskList.length} task(s)`);
  if (d.decisions) names.push(`${d.decisions.length} decision(s)`);
  if (d.openFiles) names.push(`${d.openFiles.length} open file(s)`);
  if (d.recentEdits) names.push(`${d.recentEdits.length} edit(s)`);
  return names;
}
