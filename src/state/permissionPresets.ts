// Per-project permission preset (FR31): a default for how EditHunk permission
// requests are resolved, instead of clicking accept/reject on every single one.
//
// The PRD's own language for this feature names 3 tiers modeled on Claude Code's
// permission-mode vocabulary: "default" / "acceptEdits" / "bypass". This module
// deliberately builds only the first two.
//
// Why: the frozen 🔴 ACP-host contract (`crates/acp-host/src/contract.rs`)
// defines the *entire* `AgentEvent` enum this app can ever receive, and it has
// exactly one permission-shaped variant — `EditHunk` (a reviewable file-content
// diff awaiting accept/reject). There is no separate "tool-call" or
// "destructive-action" event distinct from a file edit. So a "bypass" preset
// would have nothing more destructive to bypass than "acceptEdits" already
// covers — adding one anyway would present the user with a distinction that
// doesn't exist in the underlying system, which is exactly what NFR2
// (honesty-by-design) exists to prevent. If a real destructive-action
// `AgentEvent` variant is ever added (a 🔴-frozen-contract change, out of scope
// here), a third tier can be added then — not before.
export type PermissionPreset = "default" | "acceptEdits";

import { load, save } from "./persist";

const KEY = "permissionPresets";

/** Per-project map: cwd -> preset. There's no general project-scoping concept
 * yet (FR28 "config scopes" is deferred to v1.1), so this is a flat map keyed
 * by the raw working-directory string the app already treats as "the project". */
export type PermissionPresetMap = Record<string, PermissionPreset>;

export function loadPresets(): PermissionPresetMap {
  return load<PermissionPresetMap>(KEY, {});
}

export function savePresets(presets: PermissionPresetMap): void {
  save(KEY, presets);
}

/** The preset in effect for `cwd`. Unconfigured projects default to "default"
 * (ask every time) — today's status-quo behavior, never silently upgraded. */
export function getPreset(presets: PermissionPresetMap, cwd: string): PermissionPreset {
  return presets[cwd] ?? "default";
}

/**
 * Pure decision function: given the preset in effect and the kind of event
 * under consideration, should it auto-resolve or be surfaced to the user?
 *
 * `eventType` is kept as a real parameter rather than hardcoded away because it
 * documents the actual constraint this preset operates under: today `editHunk`
 * is the *only* permission-shaped event the frozen ACP-host contract can emit
 * (see the module comment above), so this function only ever gets called with
 * "editHunk" — but the signature stays honest about what it's actually deciding
 * over instead of silently assuming that will always be true.
 */
export function resolvePresetDecision(
  preset: PermissionPreset,
  eventType: "editHunk",
): "accept" | "ask" {
  if (eventType === "editHunk" && preset === "acceptEdits") return "accept";
  return "ask";
}
