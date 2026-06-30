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
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_ids_resolve_to_adapters() {
        assert!(adapter_for(CLAUDE).is_some());
        assert!(adapter_for(CODEX).is_some());
        assert!(adapter_for("nope").is_none());
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
    fn known_agents_lists_both() {
        let ids: Vec<_> = known_agents().into_iter().map(|a| a.id).collect();
        assert!(ids.contains(&CLAUDE.to_string()));
        assert!(ids.contains(&CODEX.to_string()));
    }
}
