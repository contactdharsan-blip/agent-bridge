//! Drift detection (plan §2, PRD FR11).
//!
//! Native config files are generate-only, but a user may hand-edit one out of
//! band. On the next sync we must **flag** that rather than silently clobber it.
//! This reuses the round-trip property: normalize the on-disk file through the
//! same parse the projector's identity test trusts, and compare it to what the
//! canonical store would project. Pure → 🟢.

use canonical::McpServer;
use serde::{Deserialize, Serialize};

use crate::{parse_mcp, project_mcp, Target};

/// The drift state of one native config file vs the canonical store.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum DriftStatus {
    /// No file on disk yet — safe to generate.
    Missing,
    /// On disk matches what we would project — safe to regenerate (no-op).
    InSync,
    /// On disk parses but differs from canonical — a hand-edit. Do NOT clobber
    /// without surfacing this first.
    Drifted {
        /// Server names present on disk but not in canonical.
        added: Vec<String>,
        /// Server names in canonical but missing from disk.
        removed: Vec<String>,
        /// Server names present in both but with different config.
        changed: Vec<String>,
    },
    /// On disk does not parse as this target's format (foreign/corrupt). Flag
    /// loudly — never overwrite something we can't even read.
    Unreadable {
        /// Parser detail.
        detail: String,
    },
}

/// Normalize servers to the shape a native file carries: active only, no
/// tool-count metadata, sorted by name — so comparison is apples-to-apples.
fn normalized(servers: &[McpServer]) -> Vec<McpServer> {
    let mut v: Vec<McpServer> = servers
        .iter()
        .filter(|s| !s.disabled)
        .cloned()
        .map(|mut s| {
            s.tool_count = None;
            s.disabled = false;
            s
        })
        .collect();
    v.sort_by(|a, b| a.name.cmp(&b.name));
    v
}

/// Compare the on-disk native file against the canonical MCP servers.
pub fn detect_mcp_drift(target: Target, on_disk: Option<&str>, canonical: &[McpServer]) -> DriftStatus {
    let on_disk = match on_disk {
        None => return DriftStatus::Missing,
        Some(s) => s,
    };

    let disk_servers = match parse_mcp(target, on_disk) {
        Ok(s) => s,
        Err(e) => return DriftStatus::Unreadable { detail: e.to_string() },
    };

    // What canonical *would* look like on disk (round-tripped to the same shape).
    let expected = match parse_mcp(target, &project_mcp(target, canonical).contents) {
        Ok(s) => s,
        Err(e) => return DriftStatus::Unreadable { detail: e.to_string() },
    };

    let disk = normalized(&disk_servers);
    let want = normalized(&expected);
    if disk == want {
        return DriftStatus::InSync;
    }

    let disk_names: Vec<&str> = disk.iter().map(|s| s.name.as_str()).collect();
    let want_names: Vec<&str> = want.iter().map(|s| s.name.as_str()).collect();

    let added: Vec<String> = disk
        .iter()
        .filter(|s| !want_names.contains(&s.name.as_str()))
        .map(|s| s.name.clone())
        .collect();
    let removed: Vec<String> = want
        .iter()
        .filter(|s| !disk_names.contains(&s.name.as_str()))
        .map(|s| s.name.clone())
        .collect();
    // Present in both but config differs.
    let changed: Vec<String> = disk
        .iter()
        .filter_map(|d| {
            want.iter()
                .find(|w| w.name == d.name)
                .filter(|w| w.transport != d.transport)
                .map(|_| d.name.clone())
        })
        .collect();

    DriftStatus::Drifted { added, removed, changed }
}

#[cfg(test)]
mod tests {
    use super::*;
    use canonical::McpTransport;

    fn server(name: &str, cmd: &str) -> McpServer {
        McpServer {
            name: name.into(),
            transport: McpTransport::Stdio { command: cmd.into(), args: vec![], env: vec![] },
            tool_count: Some(3),
            disabled: false,
        }
    }

    #[test]
    fn missing_file_is_missing() {
        assert_eq!(detect_mcp_drift(Target::Claude, None, &[server("a", "x")]), DriftStatus::Missing);
    }

    #[test]
    fn regenerated_file_is_in_sync() {
        let servers = vec![server("a", "x"), server("b", "y")];
        let on_disk = project_mcp(Target::Claude, &servers).contents;
        assert_eq!(detect_mcp_drift(Target::Claude, Some(&on_disk), &servers), DriftStatus::InSync);
    }

    #[test]
    fn hand_added_server_is_flagged() {
        let canonical = vec![server("a", "x")];
        // Disk has an extra server the user added by hand.
        let on_disk = project_mcp(Target::Claude, &[server("a", "x"), server("rogue", "z")]).contents;
        match detect_mcp_drift(Target::Claude, Some(&on_disk), &canonical) {
            DriftStatus::Drifted { added, .. } => assert_eq!(added, vec!["rogue"]),
            other => panic!("expected drift, got {other:?}"),
        }
    }

    #[test]
    fn hand_changed_server_is_flagged_as_changed() {
        let canonical = vec![server("a", "original")];
        let on_disk = project_mcp(Target::Claude, &[server("a", "tampered")]).contents;
        match detect_mcp_drift(Target::Claude, Some(&on_disk), &canonical) {
            DriftStatus::Drifted { changed, .. } => assert_eq!(changed, vec!["a"]),
            other => panic!("expected drift, got {other:?}"),
        }
    }

    #[test]
    fn unparseable_file_is_unreadable_not_clobbered() {
        let canonical = vec![server("a", "x")];
        assert!(matches!(
            detect_mcp_drift(Target::Claude, Some("{ not valid json"), &canonical),
            DriftStatus::Unreadable { .. }
        ));
    }

    #[test]
    fn disabled_canonical_servers_dont_count_as_drift() {
        let mut disabled = server("hidden", "x");
        disabled.disabled = true;
        let canonical = vec![server("a", "x"), disabled];
        // Disk has only the active server → in sync (disabled isn't projected).
        let on_disk = project_mcp(Target::Claude, &canonical).contents;
        assert_eq!(detect_mcp_drift(Target::Claude, Some(&on_disk), &canonical), DriftStatus::InSync);
    }
}
