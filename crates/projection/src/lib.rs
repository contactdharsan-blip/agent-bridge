//! The Projection Engine — pure `canonical → native format` functions, one per
//! target (plan §3a). 🟢 zone: every function is input-in / string-out with no
//! state, verified by the round-trip identity test (`parse(project(x)) == x`),
//! not by reading the diff.
//!
//! It is deliberately **bidirectional**: each target has a `parse` (native →
//! canonical) and a `project` (canonical → native). The pairing is what makes
//! correctness *demonstrable* — re-emitting a parsed config and re-parsing it
//! must yield the same canonical model, so no field is silently dropped.
//!
//! Two product guarantees are encoded here:
//! - **No inlined secrets** — a [`canonical::SecretRef`] always renders as a
//!   `${VAR}` placeholder, never a token (PRD FR12). Tested directly.
//! - **Cursor's ~40-tool ceiling** — projecting to [`Target::Cursor`] sums the
//!   active servers' tool counts and warns before a config that is fine in
//!   Claude silently overflows Cursor (PRD FR10).

use canonical::{ConfigValue, McpServer, SecretRef};
use serde::{Deserialize, Serialize};

mod files;
mod instructions;
mod json_mcp;
mod skills;
mod toml_mcp;

pub use files::{project_agents_md, RepoFileArtifact};
pub use instructions::{instructions_path, project_instructions, InstructionArtifact};
pub use skills::{default_skills_root, place_skill, plan_skill_placement, SkillPlacement};

/// Cursor's practical MCP tool ceiling. Beyond this, tools are silently dropped
/// by Cursor, so we warn first (plan §2, PRD FR10).
pub const CURSOR_TOOL_CEILING: u32 = 40;

/// Which agent a projection targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    /// Claude Code — `.mcp.json` / `~/.claude.json` (JSON, `mcpServers`).
    Claude,
    /// Codex — `.codex/config.toml` (TOML, `[mcp_servers.*]`).
    Codex,
    /// Cursor — `.cursor/mcp.json` (JSON, `mcpServers`). Subject to the tool ceiling.
    Cursor,
}

impl Target {
    /// The conventional native config path (relative) this target projects to.
    pub fn config_path(self) -> &'static str {
        match self {
            Target::Claude => ".mcp.json",
            Target::Codex => ".codex/config.toml",
            Target::Cursor => ".cursor/mcp.json",
        }
    }
}

/// A non-fatal warning surfaced alongside a projection (so the UI can show it
/// before writing the file).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum ProjectionWarning {
    /// The active servers' cumulative tool count exceeds Cursor's ceiling.
    CursorToolCeiling {
        /// Summed tool count across active servers.
        total: u32,
        /// The ceiling that was exceeded.
        ceiling: u32,
    },
    /// One or more active servers have no declared `tool_count`, so the ceiling
    /// check is a lower bound, not exact.
    UnknownToolCounts {
        /// Names of servers with unknown tool counts.
        servers: Vec<String>,
    },
}

/// The output of projecting MCP servers to one target.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpProjection {
    /// The native config file contents to write.
    pub contents: String,
    /// Cumulative tool count across active servers (sum of known counts).
    pub tool_count: u32,
    /// Non-fatal warnings (e.g. Cursor ceiling) to surface before writing.
    pub warnings: Vec<ProjectionWarning>,
}

/// Errors from parsing a native config back into the canonical model.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ProjectionError {
    /// The input was not valid JSON/TOML.
    #[error("could not parse {target:?} config: {detail}")]
    Syntax {
        /// Which target's format failed.
        target: Target,
        /// Parser detail.
        detail: String,
    },
    /// The structure was valid but a required field was missing/ill-typed.
    #[error("malformed {target:?} config at {path}: {detail}")]
    Shape {
        /// Which target's format.
        target: Target,
        /// Logical path to the problem (e.g. `mcpServers.foo`).
        path: String,
        /// What was wrong.
        detail: String,
    },
}

/// Project MCP servers into `target`'s native config format.
///
/// Disabled servers are omitted from the emitted config but the function is
/// otherwise total. For [`Target::Cursor`] the result carries a tool-ceiling
/// warning when the active set would overflow.
pub fn project_mcp(target: Target, servers: &[McpServer]) -> McpProjection {
    let active: Vec<&McpServer> = servers.iter().filter(|s| !s.disabled).collect();

    let contents = match target {
        Target::Claude | Target::Cursor => json_mcp::project(&active),
        Target::Codex => toml_mcp::project(&active),
    };

    let tool_count: u32 = active.iter().filter_map(|s| s.tool_count).sum();
    let mut warnings = Vec::new();

    let unknown: Vec<String> = active
        .iter()
        .filter(|s| s.tool_count.is_none())
        .map(|s| s.name.clone())
        .collect();

    if target == Target::Cursor {
        if tool_count > CURSOR_TOOL_CEILING {
            warnings.push(ProjectionWarning::CursorToolCeiling {
                total: tool_count,
                ceiling: CURSOR_TOOL_CEILING,
            });
        }
        if !unknown.is_empty() {
            warnings.push(ProjectionWarning::UnknownToolCounts { servers: unknown });
        }
    }

    McpProjection { contents, tool_count, warnings }
}

/// Parse a native config back into canonical MCP servers (the inverse of
/// [`project_mcp`], modulo formatting and tool-count metadata which native
/// configs don't carry).
pub fn parse_mcp(target: Target, contents: &str) -> Result<Vec<McpServer>, ProjectionError> {
    match target {
        Target::Claude | Target::Cursor => json_mcp::parse(target, contents),
        Target::Codex => toml_mcp::parse(contents),
    }
}

/// Classify a raw native value: a lone `${VAR}` interpolation is a secret
/// reference; anything else is a literal. This is the deterministic rule that
/// makes parse/project a clean inverse for secrets (a `Secret` renders to
/// `${VAR}`, which re-parses to the same `Secret`).
pub(crate) fn classify(raw: &str) -> ConfigValue {
    match parse_env_placeholder(raw) {
        Some(var) => ConfigValue::Secret { secret: SecretRef::Env { var } },
        None => ConfigValue::literal(raw),
    }
}

/// If `s` is exactly `${NAME}` for a valid env-var `NAME`, return `NAME`.
fn parse_env_placeholder(s: &str) -> Option<String> {
    let inner = s.trim().strip_prefix("${")?.strip_suffix('}')?;
    let mut chars = inner.chars();
    let first_ok = matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_');
    let rest_ok = inner.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if first_ok && rest_ok {
        Some(inner.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use canonical::{EnvVar, McpTransport};

    fn stdio_server(name: &str, tools: Option<u32>) -> McpServer {
        McpServer {
            name: name.into(),
            transport: McpTransport::Stdio {
                command: "srv".into(),
                args: vec!["--flag".into()],
                env: vec![EnvVar { key: "TOKEN".into(), value: ConfigValue::env_secret("MY_TOKEN") }],
            },
            tool_count: tools,
            disabled: false,
        }
    }

    #[test]
    fn classify_distinguishes_secret_from_literal() {
        assert!(classify("${GITHUB_TOKEN}").is_secret());
        assert!(!classify("github.com").is_secret());
        // Not a lone placeholder → literal (we don't try to partially interpolate).
        assert!(!classify("Bearer ${TOK}").is_secret());
        assert!(!classify("${1BAD}").is_secret());
    }

    #[test]
    fn cursor_warns_over_ceiling_claude_does_not() {
        let servers = vec![stdio_server("a", Some(30)), stdio_server("b", Some(20))];
        let cursor = project_mcp(Target::Cursor, &servers);
        assert_eq!(cursor.tool_count, 50);
        assert!(cursor
            .warnings
            .iter()
            .any(|w| matches!(w, ProjectionWarning::CursorToolCeiling { total: 50, .. })));

        let claude = project_mcp(Target::Claude, &servers);
        assert!(claude.warnings.is_empty(), "ceiling is Cursor-specific");
    }

    #[test]
    fn cursor_flags_unknown_tool_counts() {
        let servers = vec![stdio_server("a", None)];
        let cursor = project_mcp(Target::Cursor, &servers);
        assert!(cursor
            .warnings
            .iter()
            .any(|w| matches!(w, ProjectionWarning::UnknownToolCounts { .. })));
    }

    #[test]
    fn disabled_servers_are_not_projected() {
        let mut s = stdio_server("hidden", Some(5));
        s.disabled = true;
        let p = project_mcp(Target::Claude, &[s]);
        assert!(!p.contents.contains("hidden"));
        assert_eq!(p.tool_count, 0);
    }

    #[test]
    fn no_secret_token_is_ever_inlined() {
        // The model only ever holds a reference; projecting must emit `${VAR}`.
        let servers = vec![stdio_server("a", Some(1))];
        for target in [Target::Claude, Target::Codex, Target::Cursor] {
            let out = project_mcp(target, &servers).contents;
            assert!(out.contains("${MY_TOKEN}"), "{target:?} should reference the secret");
            assert!(!out.contains("sk-"), "{target:?} must not inline a token");
        }
    }
}
