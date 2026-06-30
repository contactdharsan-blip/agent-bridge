//! Secret storage — keep the literal token off disk (plan §2, §6b; PRD FR12/FR27).
//!
//! The Projection Engine only ever writes a `${VAR}` *reference*. This crate is
//! the other half: it stores/retrieves the actual value in the OS keychain, and
//! resolves references into a child process's environment **in memory at spawn
//! time**, so the literal never touches disk.
//!
//! 🟡, platform-specific. Mirrors the `acp-host` fake/real split: a hermetic
//! [`MemoryStore`] verifies all the logic offline; the real [`KeyringStore`] is
//! exercised by an `#[ignore]`d per-OS round-trip the operator runs (a keychain
//! call can prompt / be unavailable in headless CI — a skip, never a false pass).

use std::collections::HashMap;
use std::sync::Mutex;

use canonical::{ConfigValue, McpServer, McpTransport, SecretRef};

/// Errors from a secret store.
#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    /// The backend (keychain) failed.
    #[error("secret store backend error: {0}")]
    Backend(String),
    /// An `Env` reference was passed to a write op — env secrets are shell-managed,
    /// not ours to store.
    #[error("env-var secrets are managed by the shell, not the keychain")]
    EnvNotStorable,
    /// A referenced secret could not be resolved at spawn time.
    #[error("secret {0} is not set (no env var and no keychain entry)")]
    Unresolved(String),
}

/// Store + resolve secrets behind a reference. Never returns a literal to disk —
/// only to an in-memory spawn environment.
pub trait SecretStore {
    /// Store `value` for a keychain reference. `Env` refs are rejected.
    fn set(&self, secret: &SecretRef, value: &str) -> Result<(), SecretError>;
    /// Retrieve a keychain reference's value, or `None` if absent.
    fn get(&self, secret: &SecretRef) -> Result<Option<String>, SecretError>;
    /// Delete a keychain reference.
    fn delete(&self, secret: &SecretRef) -> Result<(), SecretError>;
}

/// A hermetic, in-memory store for tests and for the secret-binding-manager logic.
#[derive(Default)]
pub struct MemoryStore {
    map: Mutex<HashMap<(String, String), String>>,
}

impl MemoryStore {
    /// Create an empty store.
    pub fn new() -> Self {
        Self::default()
    }

    /// Key a keychain ref; `Env` refs aren't storable here.
    fn key(secret: &SecretRef) -> Result<(String, String), SecretError> {
        match secret {
            SecretRef::Keychain { service, account } => Ok((service.clone(), account.clone())),
            SecretRef::Env { .. } => Err(SecretError::EnvNotStorable),
        }
    }
}

impl SecretStore for MemoryStore {
    fn set(&self, secret: &SecretRef, value: &str) -> Result<(), SecretError> {
        let k = Self::key(secret)?;
        self.map.lock().unwrap().insert(k, value.to_string());
        Ok(())
    }
    fn get(&self, secret: &SecretRef) -> Result<Option<String>, SecretError> {
        let k = Self::key(secret)?;
        Ok(self.map.lock().unwrap().get(&k).cloned())
    }
    fn delete(&self, secret: &SecretRef) -> Result<(), SecretError> {
        let k = Self::key(secret)?;
        self.map.lock().unwrap().remove(&k);
        Ok(())
    }
}

/// The real OS keychain store (macOS Keychain / Windows Credential Manager /
/// Linux Secret Service), via the `keyring` crate.
pub struct KeyringStore;

impl KeyringStore {
    /// Build a keyring entry for a keychain reference.
    fn entry(secret: &SecretRef) -> Result<keyring::Entry, SecretError> {
        match secret {
            SecretRef::Keychain { service, account } => {
                keyring::Entry::new(service, account).map_err(|e| SecretError::Backend(e.to_string()))
            }
            SecretRef::Env { .. } => Err(SecretError::EnvNotStorable),
        }
    }
}

impl SecretStore for KeyringStore {
    fn set(&self, secret: &SecretRef, value: &str) -> Result<(), SecretError> {
        Self::entry(secret)?
            .set_password(value)
            .map_err(|e| SecretError::Backend(e.to_string()))
    }
    fn get(&self, secret: &SecretRef) -> Result<Option<String>, SecretError> {
        match Self::entry(secret)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(SecretError::Backend(e.to_string())),
        }
    }
    fn delete(&self, secret: &SecretRef) -> Result<(), SecretError> {
        match Self::entry(secret)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(SecretError::Backend(e.to_string())),
        }
    }
}

/// One unresolved/resolved secret binding, for the binding-manager UI (FR27).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecretBinding {
    /// The env-var name the projected config references.
    pub env_name: String,
    /// Whether the reference resolves right now (env present, or keychain entry exists).
    pub resolvable: bool,
    /// True if the source is the keychain (vs a shell env var).
    pub from_keychain: bool,
}

/// Every secret reference across the given servers, with whether it resolves —
/// the data behind "is this `${VAR}` a dead reference?" (FR27). Never returns the
/// secret value.
pub fn audit_bindings(servers: &[McpServer], store: &dyn SecretStore) -> Vec<SecretBinding> {
    let mut out = Vec::new();
    for s in servers {
        for secret in s.secret_refs() {
            let resolvable = match secret {
                SecretRef::Env { var } => std::env::var(var).is_ok(),
                SecretRef::Keychain { .. } => store.get(secret).ok().flatten().is_some(),
            };
            out.push(SecretBinding {
                env_name: secret.env_name(),
                resolvable,
                from_keychain: matches!(secret, SecretRef::Keychain { .. }),
            });
        }
    }
    out
}

/// Resolve every secret a server references into `(ENV_NAME, value)` pairs to
/// inject into the spawned process — in memory, never written to disk. Env refs
/// resolve from the parent environment; keychain refs from `store`.
pub fn resolve_spawn_env(
    server: &McpServer,
    store: &dyn SecretStore,
) -> Result<Vec<(String, String)>, SecretError> {
    let values: Vec<&ConfigValue> = match &server.transport {
        McpTransport::Stdio { env, .. } => env.iter().map(|e| &e.value).collect(),
        McpTransport::Http { headers, .. } => headers.iter().map(|h| &h.value).collect(),
    };

    let mut out = Vec::new();
    for v in values {
        if let ConfigValue::Secret { secret } = v {
            let value = match secret {
                SecretRef::Env { var } => std::env::var(var)
                    .map_err(|_| SecretError::Unresolved(secret.env_name()))?,
                SecretRef::Keychain { .. } => store
                    .get(secret)?
                    .ok_or_else(|| SecretError::Unresolved(secret.env_name()))?,
            };
            out.push((secret.env_name(), value));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use canonical::{EnvVar, McpTransport};

    fn keychain_ref() -> SecretRef {
        SecretRef::Keychain { service: "agent-bridge-test".into(), account: "demo".into() }
    }

    #[test]
    fn memory_store_round_trips_and_deletes() {
        let store = MemoryStore::new();
        let r = keychain_ref();
        assert_eq!(store.get(&r).unwrap(), None);
        store.set(&r, "s3cr3t").unwrap();
        assert_eq!(store.get(&r).unwrap().as_deref(), Some("s3cr3t"));
        store.delete(&r).unwrap();
        assert_eq!(store.get(&r).unwrap(), None);
    }

    #[test]
    fn env_secrets_are_not_storable() {
        let store = MemoryStore::new();
        let r = SecretRef::Env { var: "FOO".into() };
        assert!(matches!(store.set(&r, "x"), Err(SecretError::EnvNotStorable)));
    }

    #[test]
    fn resolve_spawn_env_pulls_value_into_memory_only() {
        let store = MemoryStore::new();
        let r = keychain_ref();
        store.set(&r, "live-token").unwrap();
        let server = McpServer {
            name: "gh".into(),
            transport: McpTransport::Stdio {
                command: "x".into(),
                args: vec![],
                env: vec![EnvVar { key: "TOKEN".into(), value: ConfigValue::Secret { secret: r.clone() } }],
            },
            tool_count: None,
            disabled: false,
        };
        let env = resolve_spawn_env(&server, &store).unwrap();
        assert_eq!(env, vec![("AGENT_BRIDGE_TEST_DEMO".to_string(), "live-token".to_string())]);
    }

    #[test]
    fn unresolved_secret_is_an_error_not_a_silent_empty() {
        let store = MemoryStore::new(); // empty → keychain ref won't resolve
        let server = McpServer {
            name: "gh".into(),
            transport: McpTransport::Stdio {
                command: "x".into(),
                args: vec![],
                env: vec![EnvVar { key: "T".into(), value: ConfigValue::Secret { secret: keychain_ref() } }],
            },
            tool_count: None,
            disabled: false,
        };
        assert!(matches!(resolve_spawn_env(&server, &store), Err(SecretError::Unresolved(_))));
    }

    #[test]
    fn audit_reports_resolvability_without_leaking_values() {
        let store = MemoryStore::new();
        store.set(&keychain_ref(), "v").unwrap();
        let server = McpServer {
            name: "gh".into(),
            transport: McpTransport::Stdio {
                command: "x".into(),
                args: vec![],
                env: vec![EnvVar { key: "T".into(), value: ConfigValue::Secret { secret: keychain_ref() } }],
            },
            tool_count: None,
            disabled: false,
        };
        let bindings = audit_bindings(std::slice::from_ref(&server), &store);
        assert_eq!(bindings.len(), 1);
        assert!(bindings[0].resolvable);
        assert!(bindings[0].from_keychain);
        // The value never appears in the audit output.
        assert!(!format!("{bindings:?}").contains('v') || !format!("{bindings:?}").contains("\"v\""));
    }

    /// THE security property (plan §6b): a config projected from a server whose
    /// secret is stored in the keychain contains the `${VAR}` reference and
    /// NEVER the stored token. Grep the generated config, find nothing.
    #[test]
    fn projected_config_never_contains_the_stored_token() {
        use projection::{project_mcp, Target};
        let store = MemoryStore::new();
        let r = keychain_ref();
        store.set(&r, "SUPER_SECRET_TOKEN_VALUE").unwrap();
        let server = McpServer {
            name: "gh".into(),
            transport: McpTransport::Stdio {
                command: "x".into(),
                args: vec![],
                env: vec![EnvVar { key: "TOKEN".into(), value: ConfigValue::Secret { secret: r } }],
            },
            tool_count: None,
            disabled: false,
        };
        for target in [Target::Claude, Target::Codex, Target::Cursor] {
            let config = project_mcp(target, std::slice::from_ref(&server)).contents;
            assert!(!config.contains("SUPER_SECRET_TOKEN_VALUE"), "{target:?} leaked the token!");
            assert!(config.contains("${AGENT_BRIDGE_TEST_DEMO}"), "{target:?} should reference it");
        }
    }

    /// Real OS keychain round-trip — operator-run per OS (may prompt / be
    /// unavailable in headless CI). Run with:
    ///   cargo test -p secrets --test '*' real_keychain -- --ignored
    #[test]
    #[ignore = "touches the real OS keychain; run explicitly per OS"]
    fn real_keychain_round_trip() {
        let store = KeyringStore;
        let r = SecretRef::Keychain { service: "agent-bridge-throwaway".into(), account: "ci".into() };
        store.set(&r, "throwaway").unwrap();
        assert_eq!(store.get(&r).unwrap().as_deref(), Some("throwaway"));
        store.delete(&r).unwrap();
        assert_eq!(store.get(&r).unwrap(), None);
    }
}
