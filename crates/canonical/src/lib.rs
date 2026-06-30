//! The Canonical Store data model — the single source of truth for every
//! projectable layer (plan §2).
//!
//! This crate is the **leaf** of the pure-function engine: it owns plain, owned,
//! `serde`-able data and nothing else. The Projection Engine ([`projection`]),
//! the Handoff Bridge ([`handoff`]), and the profile/gap-filling layer
//! ([`profile`]) all depend on these types; none of them touch the 🔴 transport
//! core.
//!
//! Two invariants are encoded in the types themselves, so they cannot be
//! violated downstream:
//!
//! 1. **Generate-only targets.** Native config files are *outputs*; the user
//!    edits these canonical entities. (The model has no notion of a native file
//!    being authoritative.)
//! 2. **Secrets are never inlined.** A sensitive value is a [`SecretRef`] — a
//!    *reference* to an env var or keychain entry — never a literal string. The
//!    literal token never enters the model, so it can never leak into a
//!    generated config (plan §2, PRD FR12).

use serde::{Deserialize, Serialize};

/// A reference to a secret, resolved at runtime — never the secret itself.
///
/// Projectors render this as an interpolation placeholder (e.g. `${VAR}`), so a
/// generated config carries the *reference*, not the token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SecretRef {
    /// Reference a shell / process environment variable by name.
    Env {
        /// The env var name (e.g. `ANTHROPIC_API_KEY`).
        var: String,
    },
    /// Reference an OS keychain entry. Resolved by the app at spawn time and
    /// injected as an env var named [`SecretRef::placeholder`]; never written to
    /// disk as a literal.
    Keychain {
        /// Keychain service / item name.
        service: String,
        /// Account within the service.
        account: String,
    },
}

impl SecretRef {
    /// The env-var name a projector references for this secret. For [`Env`] it is
    /// the var itself; for [`Keychain`] it is a deterministic derived name the
    /// app injects from the keychain at spawn time.
    ///
    /// [`Env`]: SecretRef::Env
    /// [`Keychain`]: SecretRef::Keychain
    pub fn env_name(&self) -> String {
        match self {
            SecretRef::Env { var } => var.clone(),
            SecretRef::Keychain { service, account } => {
                format!("{}_{}", sanitize_env(service), sanitize_env(account))
            }
        }
    }

    /// The interpolation placeholder written into generated configs, e.g.
    /// `${ANTHROPIC_API_KEY}`. Carries only the reference name.
    pub fn placeholder(&self) -> String {
        format!("${{{}}}", self.env_name())
    }
}

/// Uppercase a string into a safe env-var fragment (`A–Z 0–9 _`).
fn sanitize_env(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_uppercase() } else { '_' })
        .collect()
}

/// A config value that is either a non-sensitive literal or a secret reference.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ConfigValue {
    /// A plain, non-sensitive value safe to write literally.
    Literal {
        /// The literal value.
        value: String,
    },
    /// A sensitive value, stored only as a reference.
    Secret {
        /// Where to resolve the secret from.
        secret: SecretRef,
    },
}

impl ConfigValue {
    /// Convenience constructor for a literal value.
    pub fn literal(value: impl Into<String>) -> Self {
        ConfigValue::Literal { value: value.into() }
    }

    /// Convenience constructor for an env-var secret reference.
    pub fn env_secret(var: impl Into<String>) -> Self {
        ConfigValue::Secret { secret: SecretRef::Env { var: var.into() } }
    }

    /// The string a projector writes into a native config: the literal for
    /// [`Literal`], or the interpolation placeholder for [`Secret`]. A token is
    /// never produced here because the model never held one.
    ///
    /// [`Literal`]: ConfigValue::Literal
    /// [`Secret`]: ConfigValue::Secret
    pub fn rendered(&self) -> String {
        match self {
            ConfigValue::Literal { value } => value.clone(),
            ConfigValue::Secret { secret } => secret.placeholder(),
        }
    }

    /// Whether this value is a secret reference.
    pub fn is_secret(&self) -> bool {
        matches!(self, ConfigValue::Secret { .. })
    }
}

/// A `KEY=value` environment entry for an MCP server's process.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvVar {
    /// Variable name.
    pub key: String,
    /// Value (literal or secret reference).
    pub value: ConfigValue,
}

/// A header for an HTTP-transport MCP server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Header {
    /// Header name.
    pub name: String,
    /// Value (literal or secret reference).
    pub value: ConfigValue,
}

/// How an MCP server is reached. The two shapes every native format supports.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "transport", rename_all = "camelCase")]
pub enum McpTransport {
    /// A local subprocess speaking MCP over stdio.
    Stdio {
        /// Executable.
        command: String,
        /// Arguments.
        #[serde(default)]
        args: Vec<String>,
        /// Extra environment.
        #[serde(default)]
        env: Vec<EnvVar>,
    },
    /// A remote MCP server over (streamable) HTTP.
    Http {
        /// Endpoint URL.
        url: String,
        /// Request headers (e.g. auth).
        #[serde(default)]
        headers: Vec<Header>,
    },
}

/// One MCP server in the canonical store. Its `name` is the key in every native
/// format, so projection is a rename-free mapping.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpServer {
    /// Canonical, stable id (used as the key in all native configs).
    pub name: String,
    /// How to reach it.
    pub transport: McpTransport,
    /// Approximate number of tools this server exposes, if known. Used to sum
    /// against Cursor's ~40-tool ceiling (PRD FR10). `None` = unknown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_count: Option<u32>,
    /// Whether the server is disabled (kept in the store but not projected as active).
    #[serde(default)]
    pub disabled: bool,
}

impl McpServer {
    /// Every [`SecretRef`] this server references (for keychain pre-flight /
    /// secret-binding reports).
    pub fn secret_refs(&self) -> Vec<&SecretRef> {
        let values: Vec<&ConfigValue> = match &self.transport {
            McpTransport::Stdio { env, .. } => env.iter().map(|e| &e.value).collect(),
            McpTransport::Http { headers, .. } => headers.iter().map(|h| &h.value).collect(),
        };
        values
            .into_iter()
            .filter_map(|v| match v {
                ConfigValue::Secret { secret } => Some(secret),
                ConfigValue::Literal { .. } => None,
            })
            .collect()
    }
}

/// A skill (a `SKILL.md` folder). `SKILL.md` is already cross-agent, so
/// projection is placement (copy/symlink), not translation (plan §3a).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Skill {
    /// Skill name (the folder name under each agent's skills dir).
    pub name: String,
    /// Absolute source directory containing `SKILL.md` (+ any scripts).
    pub source_dir: String,
}

/// One canonical instructions document, projected to each agent's native
/// instruction surface. Projection is clean but behavior is *equivalent, not
/// identical* — the UI must label it so (plan §3a, PRD FR9).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Instructions {
    /// The canonical instruction body, in Markdown.
    pub markdown: String,
}

/// The whole canonical store: the single source of truth for projection.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Canonical {
    /// MCP servers.
    #[serde(default)]
    pub mcp_servers: Vec<McpServer>,
    /// Skills (placement only).
    #[serde(default)]
    pub skills: Vec<Skill>,
    /// One canonical instructions doc, if set.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instructions: Option<Instructions>,
    /// Repo knowledge (`AGENTS.md` body). Pass-through — the same standard file
    /// for all three agents, no projection needed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agents_md: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_ref_renders_as_placeholder_never_a_token() {
        let v = ConfigValue::env_secret("ANTHROPIC_API_KEY");
        assert_eq!(v.rendered(), "${ANTHROPIC_API_KEY}");
        assert!(v.is_secret());
        // A literal token can never be produced — the model never held one.
        assert!(!v.rendered().contains("sk-"));
    }

    #[test]
    fn keychain_ref_derives_a_stable_env_name() {
        let s = SecretRef::Keychain {
            service: "agent-bridge".into(),
            account: "openai".into(),
        };
        assert_eq!(s.env_name(), "AGENT_BRIDGE_OPENAI");
        assert_eq!(s.placeholder(), "${AGENT_BRIDGE_OPENAI}");
    }

    #[test]
    fn literal_value_passes_through() {
        let v = ConfigValue::literal("https://example.com");
        assert_eq!(v.rendered(), "https://example.com");
        assert!(!v.is_secret());
    }

    #[test]
    fn server_collects_its_secret_refs() {
        let s = McpServer {
            name: "gh".into(),
            transport: McpTransport::Stdio {
                command: "gh-mcp".into(),
                args: vec![],
                env: vec![
                    EnvVar { key: "GITHUB_TOKEN".into(), value: ConfigValue::env_secret("GITHUB_TOKEN") },
                    EnvVar { key: "GH_HOST".into(), value: ConfigValue::literal("github.com") },
                ],
            },
            tool_count: Some(12),
            disabled: false,
        };
        assert_eq!(s.secret_refs().len(), 1);
    }

    #[test]
    fn canonical_round_trips_through_json() {
        let c = Canonical {
            mcp_servers: vec![McpServer {
                name: "fs".into(),
                transport: McpTransport::Http {
                    url: "https://mcp.example.com".into(),
                    headers: vec![Header {
                        name: "Authorization".into(),
                        value: ConfigValue::env_secret("MCP_TOKEN"),
                    }],
                },
                tool_count: None,
                disabled: false,
            }],
            skills: vec![Skill { name: "profile".into(), source_dir: "/skills/profile".into() }],
            instructions: Some(Instructions { markdown: "# Rules\nBe concise.".into() }),
            agents_md: Some("# Repo\nMonorepo.".into()),
        };
        let json = serde_json::to_string(&c).unwrap();
        let back: Canonical = serde_json::from_str(&json).unwrap();
        assert_eq!(c, back);
    }
}
