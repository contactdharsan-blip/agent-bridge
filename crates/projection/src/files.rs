//! `AGENTS.md` repo-knowledge pass-through (plan §2, PRD FR8).
//!
//! `AGENTS.md` is a shared standard read by all three agents, so there is *no
//! projection* — the same file is placed identically everywhere. Modeled
//! explicitly (rather than omitted) so the UI can show "carries over as-is, no
//! translation," which is itself part of the honest portability story.

use serde::{Deserialize, Serialize};

/// A repo-level file written identically for every agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepoFileArtifact {
    /// Relative path (always `AGENTS.md` here).
    pub path: String,
    /// File contents (the canonical repo-knowledge body, unchanged).
    pub contents: String,
    /// True when the same bytes serve all agents (no per-agent translation).
    pub shared_verbatim: bool,
}

/// Pass `AGENTS.md` through unchanged. This is the identity function on the body
/// (modulo a guaranteed trailing newline) — the proof that repo knowledge is
/// already substrate-portable.
pub fn project_agents_md(body: &str) -> RepoFileArtifact {
    let contents = if body.ends_with('\n') {
        body.to_string()
    } else {
        format!("{body}\n")
    };
    RepoFileArtifact { path: "AGENTS.md".to_string(), contents, shared_verbatim: true }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agents_md_is_passed_through_verbatim() {
        let body = "# Repo\n\nMonorepo with crates/ and src/.\n";
        let a = project_agents_md(body);
        assert_eq!(a.path, "AGENTS.md");
        assert_eq!(a.contents, body); // byte-identical: no projection
        assert!(a.shared_verbatim);
    }

    #[test]
    fn trailing_newline_is_ensured() {
        let a = project_agents_md("no newline");
        assert_eq!(a.contents, "no newline\n");
    }
}
