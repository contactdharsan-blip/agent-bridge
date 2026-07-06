// Per-project permission preset (FR31): a default for how permission requests
// are resolved, instead of clicking accept/reject on every single one.
//
// The PRD's own language for this feature names 3 tiers modeled on Claude Code's
// permission-mode vocabulary: "default" / "acceptEdits" / "bypass". This module
// deliberately builds only the first two.
//
// Why: the frozen 🔴 ACP-host contract (`crates/acp-host/src/contract.rs`) now
// has TWO permission-shaped variants — `EditHunk` (a reviewable file-content
// diff) and `PermissionRequest` (a generic ask, e.g. a shell-command approval;
// added for UI-FR06) — but still nothing that flags an option as
// "destructive" vs not. FR4's non-negotiable guard ("never auto-grant a
// destructive mode") has no corresponding signal in the contract to check
// against, so a "bypass" preset that widened auto-approval to
// `PermissionRequest` couldn't actually honor FR4 — it would just be trusting
// that no generic ask is ever destructive, which is false in general (a shell
// command is exactly the kind of thing that can be). "acceptEdits" stays
// scoped to `editHunk` alone (a file diff the user can review in the same
// motion as approving it); `PermissionRequest` is deliberately excluded from
// every preset, including this one — see `resolvePresetDecision` below. If a
// real destructive-vs-safe distinction is ever added to the contract (a
// 🔴-frozen-contract change, out of scope here), a third tier can be built
// against it then — not before.
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
 * `eventType` covers both of the contract's permission-shaped `AgentEvent`
 * variants, but only `editHunk` can ever auto-resolve — see the module
 * comment for why `permissionRequest` is deliberately excluded from every
 * preset (including `acceptEdits`), not just currently unimplemented.
 */
export function resolvePresetDecision(
  preset: PermissionPreset,
  eventType: "editHunk" | "permissionRequest",
): "accept" | "ask" {
  if (eventType === "editHunk" && preset === "acceptEdits") return "accept";
  return "ask";
}
