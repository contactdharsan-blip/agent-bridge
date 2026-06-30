//! Built-in adapter registry — the ONE place agent-specific configuration lives.
//!
//! Adding an agent (M2's Codex) means adding an entry here, not new rendering
//! code. The rest of the app refers to agents only by opaque `id` strings.

use serde::{Deserialize, Serialize};

use crate::contract::AdapterSpec;

/// Stable id for the Claude Code adapter.
pub const CLAUDE: &str = "claude";
/// Stable id for the Codex adapter.
pub const CODEX: &str = "codex";
/// Stable id for the Cursor adapter (M6 — the weakest ACP leg, plan §7).
pub const CURSOR: &str = "cursor";

/// First-class auth state for the per-agent status panel (PRD FR23/FR47).
/// `Error` requires a live probe, so it is set by the runtime, not derivable
/// from env presence alone; the registry reports `Connected` / `NeedsLogin`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthStatus {
    /// A credential is present (BYO key in env / keychain).
    Connected,
    /// No credential found — the agent needs its native login.
    NeedsLogin,
    /// A live check failed (set by the runtime after a failed handshake).
    Error,
}

/// A user-facing description of a selectable agent (for the picker UI).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    /// Opaque id passed back to `start_session`.
    pub id: String,
    /// Human-readable name for display.
    pub display_name: String,
    /// Name of the env var that supplies this agent's API key.
    pub auth_env: String,
    /// Whether that env var is currently set (a cheap auth-status hint).
    pub auth_present: bool,
    /// First-class auth status derived from credential presence.
    pub auth_status: AuthStatus,
}

/// Map credential presence to a (non-error) auth status.
fn status_for(present: bool) -> AuthStatus {
    if present {
        AuthStatus::Connected
    } else {
        AuthStatus::NeedsLogin
    }
}

/// Build an [`AgentInfo`] for an agent, reading credential presence from `env`.
fn agent_info(id: &str, display_name: &str, auth_env: &str) -> AgentInfo {
    let auth_present = std::env::var(auth_env).is_ok();
    AgentInfo {
        id: id.to_string(),
        display_name: display_name.to_string(),
        auth_env: auth_env.to_string(),
        auth_present,
        auth_status: status_for(auth_present),
    }
}

/// Collect `(name, value)` pairs for the given env var names that are actually set.
fn present_env(names: &[&str]) -> Vec<(String, String)> {
    names
        .iter()
        .filter_map(|name| std::env::var(name).ok().map(|v| ((*name).to_string(), v)))
        .collect()
}

/// Build the `npx -y <package>` command parts.
fn npx(package: &str) -> (String, Vec<String>) {
    ("npx".to_string(), vec!["-y".to_string(), package.to_string()])
}

/// Return the [`AdapterSpec`] for a known agent id, or `None` if unknown.
///
/// API keys present in the environment are forwarded to the adapter; the
/// subprocess also inherits the parent environment, so an unset key here simply
/// means we add nothing extra (the adapter then reports needing login).
pub fn adapter_for(agent_id: &str) -> Option<AdapterSpec> {
    match agent_id {
        CLAUDE => {
            let (command, args) = npx("@zed-industries/claude-code-acp@latest");
            Some(AdapterSpec {
                command,
                args,
                env: present_env(&["ANTHROPIC_API_KEY", "CLAUDE_CODE_EXECUTABLE"]),
            })
        }
        CODEX => {
            let (command, args) = npx("@zed-industries/codex-acp@latest");
            Some(AdapterSpec {
                command,
                args,
                env: present_env(&["OPENAI_API_KEY"]),
            })
        }
        CURSOR => {
            // Cursor is the weakest ACP leg and its adapter landscape is
            // unstable (plan §7). Rather than bake in an unverified package, the
            // launch command is operator-overridable via `CURSOR_ACP_COMMAND`
            // (a space-separated "cmd arg1 arg2"); we default to Cursor's own
            // CLI. The architecture does not depend on this working — if the
            // adapter fights you, the app still runs Claude + Codex (M6 stance).
            let (command, args) = match std::env::var("CURSOR_ACP_COMMAND") {
                Ok(s) if !s.trim().is_empty() => {
                    let mut parts = s.split_whitespace().map(str::to_string);
                    let command = parts.next().expect("non-empty checked above");
                    (command, parts.collect())
                }
                _ => ("cursor-agent".to_string(), vec!["--acp".to_string()]),
            };
            Some(AdapterSpec {
                command,
                args,
                env: present_env(&["CURSOR_API_KEY"]),
            })
        }
        _ => None,
    }
}

/// The set of agents the app knows how to launch, with live auth-status hints.
pub fn known_agents() -> Vec<AgentInfo> {
    vec![
        agent_info(CLAUDE, "Claude Code", "ANTHROPIC_API_KEY"),
        agent_info(CODEX, "Codex", "OPENAI_API_KEY"),
        agent_info(CURSOR, "Cursor", "CURSOR_API_KEY"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_ids_resolve_to_adapters() {
        assert!(adapter_for(CLAUDE).is_some());
        assert!(adapter_for(CODEX).is_some());
        assert!(adapter_for(CURSOR).is_some());
        assert!(adapter_for("nope").is_none());
    }

    #[test]
    fn cursor_resolves_to_a_nonempty_adapter() {
        // Don't assert the exact package (operator-overridable, unverifiable
        // offline) — only that adding Cursor yields a launchable command.
        let spec = adapter_for(CURSOR).unwrap();
        assert!(!spec.command.is_empty());
    }

    #[test]
    fn claude_adapter_uses_npx_package() {
        let spec = adapter_for(CLAUDE).unwrap();
        assert_eq!(spec.command, "npx");
        assert!(spec.args.iter().any(|a| a.contains("claude-code-acp")));
    }

    #[test]
    fn codex_adapter_uses_npx_package() {
        let spec = adapter_for(CODEX).unwrap();
        assert_eq!(spec.command, "npx");
        assert!(spec.args.iter().any(|a| a.contains("codex-acp")));
    }

    #[test]
    fn known_agents_lists_all_three() {
        let ids: Vec<_> = known_agents().into_iter().map(|a| a.id).collect();
        assert!(ids.contains(&CLAUDE.to_string()));
        assert!(ids.contains(&CODEX.to_string()));
        assert!(ids.contains(&CURSOR.to_string()));
    }

    #[test]
    fn auth_status_is_consistent_with_presence() {
        for a in known_agents() {
            let expected = if a.auth_present { AuthStatus::Connected } else { AuthStatus::NeedsLogin };
            assert_eq!(a.auth_status, expected, "{} status must track its key presence", a.id);
        }
    }
}
