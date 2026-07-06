//! NFR4 "no-install agents": prefer a vendored, bundled adapter (a portable
//! Node runtime + the npm package, no system Node/npx required) when
//! `scripts/vendor-adapters.sh` has populated `src-tauri/vendor/` — falling
//! back to `registry::adapter_for`'s npx-based `AdapterSpec` whenever it
//! hasn't (dev builds, or a platform the vendor script hasn't been run for).
//! Vendoring only ever OVERRIDES the launch command/args; the registry's own
//! env-var forwarding (API keys) is untouched — this module never computes
//! or duplicates that.
//!
//! Deliberately outside `acp-host` (frozen 🔴): this needs Tauri's resource-
//! path resolution (`AppHandle`/`Manager`), which the frozen crate must never
//! depend on (it's tested via plain `cargo test`, no Tauri build). Mirrors
//! the same "hand-written command has native access, no plugin needed"
//! pattern `native_config.rs`/`terminal.rs` already established.

use std::path::PathBuf;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

/// The npm package's declared `bin` name for each known agent — kept in sync
/// with `crates/acp-host/src/registry.rs::adapter_for` and
/// `scripts/vendor-adapters.sh` by hand; there are only two, and duplicating
/// this tiny string map is far cheaper than threading it through the frozen
/// crate's public API.
fn vendored_bin_name(agent_id: &str) -> Option<&'static str> {
    match agent_id {
        "claude" => Some("claude-agent-acp"),
        "codex" => Some("codex-acp"),
        _ => None,
    }
}

/// Relative-to-resource-dir path of the vendored Node binary itself.
fn node_relative_path() -> &'static str {
    if cfg!(target_os = "windows") {
        "vendor/node/node.exe"
    } else {
        "vendor/node/bin/node"
    }
}

/// If a vendored Node runtime + this agent's adapter package are both present
/// under the app's resource directory, return the `(command, args)` pair
/// that launches them directly. `None` means "no vendored resources found for
/// this agent on this platform" — the caller keeps the npx-based default,
/// this is never a hard failure.
pub fn resolve_vendored(app: &AppHandle, agent_id: &str) -> Option<(String, Vec<String>)> {
    let bin_name = vendored_bin_name(agent_id)?;

    let node = resolve_resource(app, node_relative_path())?;
    let script = resolve_resource(
        app,
        &format!("vendor/adapters/{agent_id}/node_modules/.bin/{bin_name}"),
    )?;

    if !node.is_file() || !script.is_file() {
        return None;
    }

    Some((node.to_string_lossy().into_owned(), vec![script.to_string_lossy().into_owned()]))
}

fn resolve_resource(app: &AppHandle, relative: &str) -> Option<PathBuf> {
    app.path().resolve(relative, BaseDirectory::Resource).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_agent_has_no_vendored_bin_name() {
        assert_eq!(vendored_bin_name("cursor"), None);
        assert_eq!(vendored_bin_name("nonsense"), None);
    }

    #[test]
    fn known_agents_have_their_real_npm_bin_names() {
        assert_eq!(vendored_bin_name("claude"), Some("claude-agent-acp"));
        assert_eq!(vendored_bin_name("codex"), Some("codex-acp"));
    }

    #[test]
    fn node_relative_path_is_platform_appropriate() {
        let p = node_relative_path();
        if cfg!(target_os = "windows") {
            assert_eq!(p, "vendor/node/node.exe");
        } else {
            assert_eq!(p, "vendor/node/bin/node");
        }
    }
}
