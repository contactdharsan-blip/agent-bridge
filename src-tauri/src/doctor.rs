//! Local doctor diagnostics (FR32, v1-tagged in the PRD) — a never-uploaded,
//! read-only health check so a user (or the solo builder) can quickly see why
//! something isn't working: is Node/npx installed, do the bundled adapters
//! resolve to a launchable command, is the OS keychain reachable.
//!
//! Reuses `acp_host::registry` for adapter resolution and auth status rather
//! than re-deriving it (plan §6b: the registry is the ONE place agent-specific
//! configuration lives). The Node/npx checks and the keychain probe are new,
//! 🔴-adjacent (subprocess spawn / real keychain I/O) surface — execution-
//! verified per CLAUDE.md's trust-zone discipline, not unit-tested. Only the
//! pure version-string normalizer is unit-tested here.

use std::time::Duration;

use acp_host::{adapter_for, known_agents, AuthStatus};
use canonical::SecretRef;
use secrets::{KeyringStore, SecretStore};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::time::timeout;

/// Bound on each `--version` subprocess call. Short on purpose — unlike the
/// 30s transport-hang bound used for a real adapter handshake, this needs to
/// feel instant in the UI; a `node`/`npx` version check either returns almost
/// immediately or the binary isn't really there.
const VERSION_CHECK_TIMEOUT: Duration = Duration::from_secs(3);

/// Distinct service name for the doctor's own sentinel keychain entry, so this
/// probe can never collide with (or touch) a real user secret.
const DOCTOR_KEYCHAIN_SERVICE: &str = "agent-bridge-doctor";

/// One agent's resolved adapter command + auth status, for the doctor report.
/// Deliberately omits the adapter's resolved `env` — those pairs can carry a
/// live API key value (see `registry::present_env`), and the doctor report
/// crosses the IPC boundary to the renderer, so nothing secret belongs in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDoctorEntry {
    /// Opaque agent id (matches `AgentInfo::id` / `start_session`'s `agent_id`).
    pub id: String,
    /// Human-readable name for display.
    pub display_name: String,
    /// The executable the registry would spawn for this agent (e.g. `"npx"`).
    pub resolved_command: String,
    /// The arguments the registry would pass (e.g. `["-y", "@zed-industries/..."]`).
    pub resolved_args: Vec<String>,
    /// Credential-presence-derived auth status, straight from the registry.
    pub auth_status: AuthStatus,
}

/// The full local health-check report (FR32). Every field represents partial,
/// honest diagnostic state on its own — a missing Node install or an
/// unreachable keychain is valid report content, not a command failure, so
/// `run_doctor` never fails the whole report over one broken field.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    /// `node --version`, normalized (e.g. `"20.11.0"`), or `None` if not found.
    pub node_version: Option<String>,
    /// `npx --version`, normalized, or `None` if not found.
    pub npx_version: Option<String>,
    /// One entry per known agent, with its resolved adapter + auth status.
    pub agents: Vec<AgentDoctorEntry>,
    /// `Ok(true)` if a set→get→delete round-trip against the OS keychain
    /// succeeded; `Err(reason)` if the backend is unreachable/denied.
    pub keychain: Result<bool, String>,
}

/// Normalize a raw `--version` line — e.g. `"v20.11.0\n"` or `"  9.2.0"` — into
/// a bare version string. Pure and hand-tested; the subprocess call around it
/// is not (concurrent/transport code fails at runtime, not on the page — see
/// CLAUDE.md's trust-zone table).
fn normalize_version(raw: &str) -> String {
    raw.trim().trim_start_matches('v').trim().to_string()
}

/// Run `<cmd> --version` with a short timeout. `None` on any failure — not
/// found, timed out, non-zero exit, empty output — since a missing tool is
/// expected, reportable state, not something to propagate as an error.
async fn probe_version(cmd: &str) -> Option<String> {
    let output = timeout(VERSION_CHECK_TIMEOUT, Command::new(cmd).arg("--version").output()).await;
    let output = match output {
        Ok(Ok(out)) => out,
        _ => return None,
    };
    if !output.status.success() {
        return None;
    }
    let normalized = normalize_version(&String::from_utf8_lossy(&output.stdout));
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

/// Build the per-agent doctor rows by asking the registry — the same
/// `adapter_for`/`known_agents` the runtime shell already uses — to resolve
/// each known agent's launch command and auth status. Not reimplemented here.
fn agent_entries() -> Vec<AgentDoctorEntry> {
    known_agents()
        .into_iter()
        .filter_map(|info| {
            let adapter = adapter_for(&info.id)?;
            Some(AgentDoctorEntry {
                id: info.id,
                display_name: info.display_name,
                resolved_command: adapter.command,
                resolved_args: adapter.args,
                auth_status: info.auth_status,
            })
        })
        .collect()
}

/// Probe the real OS keychain with a throwaway set→get→delete round-trip — the
/// production counterpart of `secrets::tests::real_keychain_round_trip`
/// (which is `#[ignore]`d because a keychain call can prompt / be unavailable
/// in headless CI). Uses its own sentinel service/account so it never reads,
/// writes, or collides with a real user secret entry.
fn probe_keychain() -> Result<bool, String> {
    let store = KeyringStore;
    let sentinel = SecretRef::Keychain {
        service: DOCTOR_KEYCHAIN_SERVICE.to_string(),
        account: "probe".to_string(),
    };
    store.set(&sentinel, "doctor-probe").map_err(|e| e.to_string())?;
    let got = store.get(&sentinel).map_err(|e| e.to_string())?;
    // Always try to clean up, even if the read-back looked wrong.
    let cleanup = store.delete(&sentinel);
    if got.as_deref() != Some("doctor-probe") {
        return Err("keychain round-trip returned an unexpected value".to_string());
    }
    cleanup.map_err(|e| e.to_string())?;
    Ok(true)
}

/// Run every local health check and assemble the report (FR32). Async because
/// the version probes spawn subprocesses; the (synchronous, blocking) keychain
/// probe is moved onto a blocking thread so it can't stall the async runtime.
#[tauri::command]
pub async fn run_doctor() -> DoctorReport {
    let node_version = probe_version("node").await;
    let npx_version = probe_version("npx").await;
    let agents = agent_entries();
    let keychain = tokio::task::spawn_blocking(probe_keychain)
        .await
        .unwrap_or_else(|e| Err(format!("keychain probe task panicked: {e}")));

    DoctorReport {
        node_version,
        npx_version,
        agents,
        keychain,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_v_prefix_and_trailing_newline() {
        assert_eq!(normalize_version("v20.11.0\n"), "20.11.0");
    }

    #[test]
    fn leaves_a_bare_version_untouched() {
        assert_eq!(normalize_version("10.2.4"), "10.2.4");
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(normalize_version("  v9.0.0  \n"), "9.0.0");
    }

    #[test]
    fn empty_input_normalizes_to_empty() {
        assert_eq!(normalize_version("\n"), "");
    }
}
