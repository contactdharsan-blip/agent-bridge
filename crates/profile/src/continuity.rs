//! The Workflow Continuity Report (plan §5b, PRD FR21).
//!
//! For a chosen target agent, answer the question every multi-agent user has —
//! *"if I move this work to X, what do I need so it still feels the same?"* — in
//! four honest sections: what transfers automatically, what needs a substitute,
//! what to add for parity, and what's genuinely lost. It is the visible output
//! of the Projection Engine + Gap-Filling Engine, not hand-written advice: every
//! named gap carries a concrete resolution.

use canonical::Canonical;
use projection::{project_mcp, ProjectionWarning, Target, CURSOR_TOOL_CEILING};
use serde::{Deserialize, Serialize};

use crate::gapfill::{gap_fills, Equivalence, GapFill};
use crate::merge::MergedProfile;
use crate::schema::Agent;

/// The four-section continuity report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuityReport {
    /// Target agent the report is for.
    pub target: Agent,
    /// What carries over with no work (MCP, skills, AGENTS.md, instructions).
    pub transfers_automatically: Vec<String>,
    /// Capabilities that need a skill substitute (the Gap-Filling output).
    pub needs_substitute: Vec<GapFill>,
    /// Profile-specific rules/skills to add to keep the workflow feeling the same.
    pub add_for_parity: Vec<GapFill>,
    /// Honest, named gaps a skill can't fully close.
    pub genuinely_lost: Vec<String>,
}

/// Map the profile's [`Agent`] to the projection [`Target`].
fn as_target(agent: Agent) -> Target {
    match agent {
        Agent::Claude => Target::Claude,
        Agent::Codex => Target::Codex,
        Agent::Cursor => Target::Cursor,
    }
}

/// Build the continuity report for moving work to `target`, given the canonical
/// store (what projects) and the merged profile (how the user works).
pub fn continuity_report(target: Agent, store: &Canonical, profile: &MergedProfile) -> ContinuityReport {
    let tgt = as_target(target);
    let mut transfers = Vec::new();

    let active = store.mcp_servers.iter().filter(|s| !s.disabled).count();
    if active > 0 {
        transfers.push(format!(
            "{active} MCP server(s) carry over, projected to `{}`",
            tgt.config_path()
        ));
    }
    if !store.skills.is_empty() {
        transfers.push(format!(
            "{} skill(s) carry over verbatim — SKILL.md is already cross-agent",
            store.skills.len()
        ));
    }
    if store.agents_md.is_some() {
        transfers.push("AGENTS.md carries over unchanged (shared standard)".into());
    }
    if store.instructions.is_some() {
        transfers.push(format!(
            "Instructions project to `{}` (equivalent, not identical)",
            projection::instructions_path(tgt)
        ));
    }

    // Split gap-fills into substitutes (capability gaps) and parity (profile-specific).
    let fills = gap_fills(target, profile);
    let (add_for_parity, needs_substitute): (Vec<GapFill>, Vec<GapFill>) =
        fills.into_iter().partition(|f| f.profile_specific);

    // Genuinely lost: honest residue a skill can't fully close.
    let mut lost = Vec::new();

    // Cursor's tool ceiling can drop servers that are fine elsewhere (FR10).
    if target == Agent::Cursor {
        let proj = project_mcp(Target::Cursor, &store.mcp_servers);
        for w in &proj.warnings {
            if let ProjectionWarning::CursorToolCeiling { total, ceiling } = w {
                lost.push(format!(
                    "Cursor's ~{ceiling}-tool ceiling: your active set declares {total} tools — a \
                     subset of servers won't load on Cursor (fine on Claude/Codex)."
                ));
            }
        }
        let _ = CURSOR_TOOL_CEILING; // ceiling is surfaced via the warning above
    }

    // Approximation-only substitutes leave a residual gap — name it.
    for f in &needs_substitute {
        if f.equivalence == Equivalence::Approximation {
            lost.push(format!(
                "{}: replaced only approximately — a skill can't read the live runtime the native \
                 feature does.",
                f.capability
            ));
        }
    }

    ContinuityReport {
        target,
        transfers_automatically: transfers,
        needs_substitute,
        add_for_parity,
        genuinely_lost: lost,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::merge::MergedSignatures;
    use crate::schema::*;
    use canonical::{ConfigValue, EnvVar, Instructions, McpServer, McpTransport, Skill};

    fn store() -> Canonical {
        Canonical {
            mcp_servers: vec![
                McpServer {
                    name: "github".into(),
                    transport: McpTransport::Stdio {
                        command: "npx".into(),
                        args: vec![],
                        env: vec![EnvVar { key: "T".into(), value: ConfigValue::env_secret("GH") }],
                    },
                    tool_count: Some(25),
                    disabled: false,
                },
                McpServer {
                    name: "postgres".into(),
                    transport: McpTransport::Stdio { command: "pg".into(), args: vec![], env: vec![] },
                    tool_count: Some(30),
                    disabled: false,
                },
            ],
            skills: vec![Skill { name: "profile".into(), source_dir: "/s/profile".into() }],
            instructions: Some(Instructions { markdown: "Be concise.".into() }),
            agents_md: Some("# Repo".into()),
        }
    }

    fn profile_with_habit() -> MergedProfile {
        MergedProfile {
            agents: vec![],
            task_mix: vec![],
            friction_points: vec![],
            repeated_instructions: vec![RepeatedInstruction {
                text: "run tests first".into(),
                occurrences: 9,
                candidate_rule: "Run the test suite before claiming done.".into(),
            }],
            tool_usage_by_agent: vec![],
            strengths: vec![],
            agent_affinity: vec![],
            signatures: MergedSignatures {
                repeated_phrasings: vec![],
                peak_hours: vec![],
                abandon_persist: AbandonPersist::Mixed,
                session_rhythm: SessionRhythm::Mixed,
                avg_session_minutes: 0.0,
            },
        }
    }

    #[test]
    fn report_to_codex_has_all_four_sections() {
        let r = continuity_report(Agent::Codex, &store(), &profile_with_habit());
        // transfers: MCP + skills + AGENTS.md + instructions.
        assert!(r.transfers_automatically.iter().any(|t| t.contains("MCP server")));
        assert!(r.transfers_automatically.iter().any(|t| t.contains("skill")));
        assert!(r.transfers_automatically.iter().any(|t| t.contains("AGENTS.md")));
        assert!(r.transfers_automatically.iter().any(|t| t.contains("Instructions project")));
        // substitutes: /insights + /context capability gaps.
        assert!(r.needs_substitute.iter().any(|f| f.capability.contains("/insights")));
        // parity: the repeated-instruction rule.
        assert!(r.add_for_parity.iter().any(|f| f.capability.starts_with("Encode habit")));
        // genuinely lost: the /context approximation residue.
        assert!(r.genuinely_lost.iter().any(|l| l.contains("approximately")));
    }

    #[test]
    fn cursor_report_names_the_tool_ceiling_as_a_real_loss() {
        // 25 + 30 = 55 tools > 40 → Cursor drops a subset.
        let r = continuity_report(Agent::Cursor, &store(), &profile_with_habit());
        assert!(r.genuinely_lost.iter().any(|l| l.contains("ceiling") && l.contains("55")));
    }

    #[test]
    fn claude_report_has_no_capability_substitutes() {
        // Claude owns /insights and /context → nothing to substitute, only parity.
        let r = continuity_report(Agent::Claude, &store(), &profile_with_habit());
        assert!(r.needs_substitute.is_empty());
        assert!(r.add_for_parity.iter().any(|f| f.capability.starts_with("Encode habit")));
    }
}
