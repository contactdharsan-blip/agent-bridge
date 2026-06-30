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

/// The set of agents the app knows how to launch, with live auth-presence hints.
pub fn known_agents() -> Vec<AgentInfo> {
    vec![
        AgentInfo {
            id: CLAUDE.to_string(),
            display_name: "Claude Code".to_string(),
            auth_env: "ANTHROPIC_API_KEY".to_string(),
            auth_present: std::env::var("ANTHROPIC_API_KEY").is_ok(),
        },
        AgentInfo {
            id: CODEX.to_string(),
            display_name: "Codex".to_string(),
            auth_env: "OPENAI_API_KEY".to_string(),
            auth_present: std::env::var("OPENAI_API_KEY").is_ok(),
        },
        AgentInfo {
            id: CURSOR.to_string(),
            display_name: "Cursor".to_string(),
            auth_env: "CURSOR_API_KEY".to_string(),
            auth_present: std::env::var("CURSOR_API_KEY").is_ok(),
        },
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
}
