//! The Handoff Bridge — capture a [`ContextSnapshot`] from the outgoing agent
//! and render it as the incoming agent's opening turn (plan §3b, PRD FR13–FR15).
//!
//! This is the **reconstruction** layer, and the whole crate is built around
//! being honest about it: the brief's first line says it is a *reconstructed
//! brief, not a continued session* — the receiving agent does not inherit the
//! sender's hidden memory. That honesty is the feature (NFR2), not an apology.
//!
//! Trust zone: 🟡. The snapshot's deterministic fields are simple data; the
//! subtle part is [`render_brief`] — a bad brief silently degrades every switch.
//! So the crate is fully **deterministic**: the conversation summary and
//! timestamp are *inputs* (produced upstream by the outgoing agent or a cheap
//! summarizer), never generated here, which lets a table test pin the exact
//! brief text.

use serde::{Deserialize, Serialize};

/// Status of a task-list item (mirrors ACP's task list states).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    /// Not started.
    Pending,
    /// Currently in progress.
    InProgress,
    /// Done.
    Completed,
}

impl TaskStatus {
    /// Markdown checkbox marker for this status.
    fn marker(self) -> &'static str {
        match self {
            TaskStatus::Pending => "[ ]",
            TaskStatus::InProgress => "[~]",
            TaskStatus::Completed => "[x]",
        }
    }
}

/// One item in the carried task list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TaskItem {
    /// Task description.
    pub text: String,
    /// Current status.
    pub status: TaskStatus,
}

/// A one-line summary of a recent edit (distilled, not the raw diff — local-first).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditSummary {
    /// File that was edited.
    pub file: String,
    /// Short human summary of the change.
    pub hunk_summary: String,
}

/// The structured context carried across an agent switch. The deterministic
/// fields are held by the host directly; `conversation_summary` and `decisions`
/// are distilled upstream (never raw transcript — NFR1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    /// Agent the work is leaving.
    pub source_agent: String,
    /// Agent the work is moving to.
    pub target_agent: String,
    /// Caller-supplied timestamp (kept as an opaque string for determinism).
    pub timestamp: String,
    /// Working directory the task lives in.
    pub working_directory: String,
    /// Files currently open / in focus.
    #[serde(default)]
    pub open_files: Vec<String>,
    /// The task list as the outgoing agent saw it.
    #[serde(default)]
    pub task_list: Vec<TaskItem>,
    /// Recent edits, summarized.
    #[serde(default)]
    pub recent_edits: Vec<EditSummary>,
    /// Key decisions, as short bullets (distilled, not transcript).
    #[serde(default)]
    pub decisions: Vec<String>,
    /// A model-generated digest of the session (produced upstream).
    #[serde(default)]
    pub conversation_summary: String,
    /// Active MCP server names, so the incoming agent's env can be matched.
    #[serde(default)]
    pub active_mcp: Vec<String>,
    /// Active skill names.
    #[serde(default)]
    pub active_skills: Vec<String>,
}

impl ContextSnapshot {
    /// Serialize to JSON (for persistence / IPC to the frontend preview).
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("snapshot always serializes")
    }
}

/// Render a markdown bullet list, or an italic placeholder when empty.
fn bullets(items: impl IntoIterator<Item = String>) -> String {
    let lines: Vec<String> = items.into_iter().map(|i| format!("- {i}")).collect();
    if lines.is_empty() {
        "_none recorded_".to_string()
    } else {
        lines.join("\n")
    }
}

/// Render the snapshot as the incoming agent's opening user turn.
///
/// The output leads with explicit honest framing (this is a brief, not a resumed
/// session — FR15) and then lays out every captured field so the receiving agent
/// can reconstruct the task. Deterministic: same snapshot in → same brief out.
pub fn render_brief(s: &ContextSnapshot) -> String {
    let open_files = bullets(s.open_files.iter().map(|f| format!("`{f}`")));

    let tasks = if s.task_list.is_empty() {
        "_none recorded_".to_string()
    } else {
        s.task_list
            .iter()
            .map(|t| format!("- {} {}", t.status.marker(), t.text))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let edits = bullets(
        s.recent_edits
            .iter()
            .map(|e| format!("`{}` — {}", e.file, e.hunk_summary)),
    );
    let decisions = bullets(s.decisions.iter().cloned());

    let summary = if s.conversation_summary.trim().is_empty() {
        "_none provided_".to_string()
    } else {
        s.conversation_summary.trim().to_string()
    };

    let mcp = if s.active_mcp.is_empty() { "none".into() } else { s.active_mcp.join(", ") };
    let skills = if s.active_skills.is_empty() { "none".into() } else { s.active_skills.join(", ") };

    format!(
        "# Handoff brief: {source} → {target}\n\
         \n\
         > This is a **reconstructed brief, not a continued session**. You do not \
         share {source}'s conversation memory — resume the task from what's below, \
         and ask about anything it doesn't cover rather than assuming.\n\
         > _Captured {ts}._\n\
         \n\
         ## Working directory\n\
         `{cwd}`\n\
         \n\
         ## Open files\n\
         {open_files}\n\
         \n\
         ## Task list\n\
         {tasks}\n\
         \n\
         ## Recent edits\n\
         {edits}\n\
         \n\
         ## Key decisions\n\
         {decisions}\n\
         \n\
         ## Conversation summary\n\
         {summary}\n\
         \n\
         ## Active environment\n\
         - MCP servers: {mcp}\n\
         - Skills: {skills}\n\
         \n\
         ---\n\
         Continue this task as {target}.",
        source = s.source_agent,
        target = s.target_agent,
        ts = s.timestamp,
        cwd = s.working_directory,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> ContextSnapshot {
        ContextSnapshot {
            source_agent: "Claude Code".into(),
            target_agent: "Codex".into(),
            timestamp: "2026-06-30T12:00:00Z".into(),
            working_directory: "/work/agent-bridge".into(),
            open_files: vec!["src/lib.rs".into()],
            task_list: vec![
                TaskItem { text: "Wire projection IPC".into(), status: TaskStatus::InProgress },
                TaskItem { text: "Add Cursor adapter".into(), status: TaskStatus::Pending },
            ],
            recent_edits: vec![EditSummary {
                file: "src/lib.rs".into(),
                hunk_summary: "added project_mcp dispatch".into(),
            }],
            decisions: vec!["Files-only canonical store for v1".into()],
            conversation_summary: "Built M3+M4 projectors; tests green.".into(),
            active_mcp: vec!["github".into()],
            active_skills: vec!["profile".into()],
        }
    }

    #[test]
    fn brief_leads_with_honest_reconstruction_framing() {
        let b = render_brief(&sample());
        assert!(b.starts_with("# Handoff brief: Claude Code → Codex"));
        assert!(b.contains("reconstructed brief, not a continued session"));
        assert!(b.contains("do not share Claude Code's conversation memory"));
    }

    #[test]
    fn brief_includes_every_captured_field() {
        let b = render_brief(&sample());
        for needle in [
            "/work/agent-bridge",
            "`src/lib.rs`",
            "[~] Wire projection IPC",
            "[ ] Add Cursor adapter",
            "added project_mcp dispatch",
            "Files-only canonical store for v1",
            "Built M3+M4 projectors; tests green.",
            "MCP servers: github",
            "Skills: profile",
        ] {
            assert!(b.contains(needle), "brief missing {needle:?}");
        }
    }

    #[test]
    fn render_is_deterministic() {
        assert_eq!(render_brief(&sample()), render_brief(&sample()));
    }

    #[test]
    fn empty_fields_get_honest_placeholders_not_blanks() {
        let mut s = sample();
        s.open_files.clear();
        s.task_list.clear();
        s.recent_edits.clear();
        s.decisions.clear();
        s.conversation_summary = "   ".into();
        s.active_mcp.clear();
        s.active_skills.clear();
        let b = render_brief(&s);
        assert!(b.contains("_none recorded_"));
        assert!(b.contains("_none provided_"));
        assert!(b.contains("MCP servers: none"));
        assert!(b.contains("Skills: none"));
    }

    #[test]
    fn snapshot_round_trips_through_json() {
        let s = sample();
        let json = s.to_json();
        let back: ContextSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }
}
