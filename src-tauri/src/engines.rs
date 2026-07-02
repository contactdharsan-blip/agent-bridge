//! IPC surface for the pure engines (Projection, Handoff, Profile, Gap-Filling,
//! Secrets). Each command is a thin `#[tauri::command]` wrapper over a pure,
//! already-tested function — no logic lives here, so this file stays trivial and
//! the engines remain verifiable in isolation. All argument/return types are the
//! crates' own serde types, so the JS contract matches the Rust tests exactly.

use canonical::{Canonical, Instructions, McpServer};
use handoff::{render_brief, ContextSnapshot};
use profile::schema::Agent;
use profile::{
    continuity_report, gap_fills, merge, parse_profile, recommend, CoderProfile, ContinuityReport,
    GapFill, MergedProfile, Recommendation,
};
use projection::{
    detect_mcp_drift, parse_mcp, project_instructions, project_mcp, DriftStatus,
    InstructionArtifact, McpProjection, Target,
};
use secrets::{audit_bindings, KeyringStore, SecretBinding};

// ---- Projection Engine ----------------------------------------------------

/// Preview the native MCP config for a target without writing it (dry-run, FR24).
#[tauri::command]
pub fn preview_mcp(target: Target, servers: Vec<McpServer>) -> McpProjection {
    project_mcp(target, &servers)
}

/// Detect whether a native file on disk has drifted from canonical (FR11).
#[tauri::command]
pub fn check_drift(target: Target, on_disk: Option<String>, servers: Vec<McpServer>) -> DriftStatus {
    detect_mcp_drift(target, on_disk.as_deref(), &servers)
}

/// Preview the projected instructions file for a target (equivalent-not-identical).
#[tauri::command]
pub fn preview_instructions(target: Target, instructions: Instructions) -> InstructionArtifact {
    project_instructions(target, &instructions)
}

/// Parse an existing native MCP config back into canonical servers (FR26 import wizard).
#[tauri::command]
pub fn parse_native_mcp(target: Target, contents: String) -> Result<Vec<McpServer>, String> {
    parse_mcp(target, &contents).map_err(|e| e.to_string())
}

// ---- Handoff Bridge -------------------------------------------------------

/// Render a context snapshot as the incoming agent's opening brief (M5).
#[tauri::command]
pub fn build_handoff_brief(snapshot: ContextSnapshot) -> String {
    render_brief(&snapshot)
}

// ---- Profile + Gap-Filling + Continuity -----------------------------------

/// Validate raw Profile-Skill JSON at the boundary; reject non-conforming output.
#[tauri::command]
pub fn validate_profile(json: String) -> Result<CoderProfile, String> {
    parse_profile(&json).map_err(|e| e.to_string())
}

/// Merge up to three validated per-agent profiles into one (re-validates each).
#[tauri::command]
pub fn merge_profiles(profiles: Vec<CoderProfile>) -> Result<MergedProfile, String> {
    for p in &profiles {
        p.validate().map_err(|e| e.to_string())?;
    }
    Ok(merge(&profiles))
}

/// Personalized feature recommendations for a single agent's profile (FR20a).
#[tauri::command]
pub fn recommend_features(profile: CoderProfile) -> Vec<Recommendation> {
    recommend(&profile)
}

/// The four-section Workflow Continuity Report for moving work to `target` (FR21).
#[tauri::command]
pub fn workflow_continuity(
    target: Agent,
    store: Canonical,
    profile: MergedProfile,
) -> ContinuityReport {
    continuity_report(target, &store, &profile)
}

/// Gap-fills for moving to `target` (capability + profile-specific) (FR22a/b).
#[tauri::command]
pub fn gap_fills_for(target: Agent, profile: MergedProfile) -> Vec<GapFill> {
    gap_fills(target, &profile)
}

// ---- Secrets --------------------------------------------------------------

/// Audit which secret references resolve right now, without returning any value
/// (FR27). Env refs are checked against the live environment; keychain refs
/// against the real OS keychain (read-only presence check).
#[tauri::command]
pub fn audit_secret_bindings(servers: Vec<McpServer>) -> Vec<SecretBinding> {
    audit_bindings(&servers, &KeyringStore)
}
