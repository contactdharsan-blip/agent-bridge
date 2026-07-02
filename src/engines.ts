// IPC wrappers for the pure engines (Projection / Handoff / Profile / Gap-Filling
// / Secrets). Like ipc.ts, this is the only place these commands are invoked, so
// the rest of the UI stays a pure consumer of typed results.

import { invoke } from "@tauri-apps/api/core";
import type {
  Canonical,
  CoderProfile,
  ContextSnapshot,
  ContinuityReport,
  DriftStatus,
  GapFill,
  Instructions,
  InstructionArtifact,
  McpProjection,
  McpServer,
  MergedProfile,
  Recommendation,
  SecretBinding,
  Target,
  Agent,
} from "./engineTypes";

// ---- Projection -----------------------------------------------------------

/** Preview a target's native MCP config without writing it (dry-run, FR24). */
export function previewMcp(target: Target, servers: McpServer[]): Promise<McpProjection> {
  return invoke("preview_mcp", { target, servers });
}

/** Check whether the on-disk native file drifted from canonical (FR11). */
export function checkDrift(
  target: Target,
  onDisk: string | null,
  servers: McpServer[],
): Promise<DriftStatus> {
  return invoke("check_drift", { target, onDisk, servers });
}

/** Preview the projected instructions file (equivalent, not identical). */
export function previewInstructions(
  target: Target,
  instructions: Instructions,
): Promise<InstructionArtifact> {
  return invoke("preview_instructions", { target, instructions });
}

// ---- Handoff --------------------------------------------------------------

/** Render a context snapshot as the incoming agent's opening brief (M5). */
export function buildHandoffBrief(snapshot: ContextSnapshot): Promise<string> {
  return invoke("build_handoff_brief", { snapshot });
}

// ---- Profile / Gap-Filling / Continuity -----------------------------------

/** Validate raw Profile-Skill JSON at the boundary (rejects non-conforming). */
export function validateProfile(json: string): Promise<CoderProfile> {
  return invoke("validate_profile", { json });
}

/** Merge up to three validated per-agent profiles into one. */
export function mergeProfiles(profiles: CoderProfile[]): Promise<MergedProfile> {
  return invoke("merge_profiles", { profiles });
}

/** Personalized feature recommendations for one agent's profile (FR20a). */
export function recommendFeatures(profile: CoderProfile): Promise<Recommendation[]> {
  return invoke("recommend_features", { profile });
}

/** The four-section Workflow Continuity Report for moving to a target (FR21). */
export function workflowContinuity(
  target: Agent,
  store: Canonical,
  profile: MergedProfile,
): Promise<ContinuityReport> {
  return invoke("workflow_continuity", { target, store, profile });
}

/** Gap-fills for moving work to a target (capability + profile-specific). */
export function gapFillsFor(target: Agent, profile: MergedProfile): Promise<GapFill[]> {
  return invoke("gap_fills_for", { target, profile });
}

// ---- Secrets --------------------------------------------------------------

/** Audit which secret references resolve now, without returning any value (FR27). */
export function auditSecretBindings(servers: McpServer[]): Promise<SecretBinding[]> {
  return invoke("audit_secret_bindings", { servers });
}

// ---- Native config file I/O ------------------------------------------------
// Real fs reads/writes for the native config/instructions files the projection
// commands above only ever preview (FR24: the Config panel's "apply" actually
// writing to disk; FR26: the import wizard reading an existing user's native
// files back into the canonical store). `cwd` + a relative `path` are resolved
// and guarded against path traversal on the Rust side.

/** Read a native file under `cwd`. `null` if it doesn't exist yet (not an error). */
export function readNativeFile(cwd: string, path: string): Promise<string | null> {
  return invoke("read_native_file", { cwd, path });
}

/** Write `contents` to a native file under `cwd`, creating parent dirs as needed. */
export function writeNativeFile(cwd: string, path: string, contents: string): Promise<void> {
  return invoke("write_native_file", { cwd, path, contents });
}

/** Parse an existing native MCP config back into canonical servers (FR26 import). */
export function parseNativeMcp(target: Target, contents: string): Promise<McpServer[]> {
  return invoke("parse_native_mcp", { target, contents });
}
