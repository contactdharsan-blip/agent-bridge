//! Profile-to-platform matching (PRD FR20a, plan §5b).
//!
//! A structured map of each platform's features + pure rules that match a
//! *person's measured traits* against them. The output is the personalization
//! payload: "given how you actually work, here are the features on each platform
//! you're underusing." This is the app's logic (not the skill's), and it is
//! 🟢 — a pure function over a validated [`CoderProfile`], table-tested.

use serde::{Deserialize, Serialize};

use crate::schema::{Agent, CoderProfile, FrictionPattern, TaskCategory};

/// A platform feature the matcher can recommend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformFeature {
    /// Which agent owns the feature.
    pub agent: Agent,
    /// Stable slug.
    pub slug: String,
    /// Display name.
    pub name: String,
    /// One-line description.
    pub description: String,
}

/// A personalized recommendation: use `feature` because of `because` (a measured
/// trait), with `evidence` drawn from the profile.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    /// The recommended feature.
    pub feature: PlatformFeature,
    /// The trait that triggered it (the "because you…").
    pub because: String,
    /// Concrete evidence from the profile.
    pub evidence: String,
}

fn feat(agent: Agent, slug: &str, name: &str, description: &str) -> PlatformFeature {
    PlatformFeature {
        agent,
        slug: slug.to_string(),
        name: name.to_string(),
        description: description.to_string(),
    }
}

/// The structured catalog of platform features the matcher draws from.
pub fn feature_catalog() -> Vec<PlatformFeature> {
    vec![
        feat(Agent::Claude, "subagents", "Claude subagents", "Fan work out to parallel sub-agents."),
        feat(Agent::Claude, "context", "Claude /context", "Inspect why a thread bloated before abandoning it."),
        feat(Agent::Claude, "hooks", "Claude hooks", "Automate repeated pre/post actions."),
        feat(Agent::Claude, "skills", "Claude skills", "Reusable SKILL.md capabilities."),
        feat(Agent::Codex, "parallel-terminals", "Codex parallel terminals", "Run several long tasks at once."),
        feat(Agent::Codex, "long-autonomy", "Codex long-autonomy runs", "Hand off lengthy autonomous work."),
        feat(Agent::Cursor, "best-of-n", "Cursor /best-of-n", "Try multiple approaches fast and pick the best."),
        feat(Agent::Cursor, "tab-model", "Cursor Tab model", "Inline multi-edit prediction while typing."),
    ]
}

/// Find a feature by slug in the catalog.
fn find(slug: &str) -> PlatformFeature {
    feature_catalog()
        .into_iter()
        .find(|f| f.slug == slug)
        .expect("known slug")
}

/// Fraction of the task mix in a given category (0 if absent).
fn task_fraction(p: &CoderProfile, cat: TaskCategory) -> f64 {
    p.task_mix.iter().find(|t| t.category == cat).map(|t| t.fraction).unwrap_or(0.0)
}

/// Share of tool calls that were MCP calls (0 if no calls).
fn mcp_share(p: &CoderProfile) -> f64 {
    let t = &p.tool_usage;
    let total = (t.edit + t.bash + t.mcp_calls + t.web + t.read) as f64;
    if total == 0.0 {
        0.0
    } else {
        t.mcp_calls as f64 / total
    }
}

/// Whether the user abandons quickly (by tendency or measured abandon rate).
fn abandons_quickly(p: &CoderProfile) -> bool {
    use crate::schema::AbandonPersist::AbandonsQuickly;
    if p.signatures.abandon_persist == AbandonsQuickly {
        return true;
    }
    let sessions = p.data.sessions_analyzed.max(1) as f64;
    p.efficiency.abandoned_sessions as f64 / sessions > 0.3
}

/// Generate personalized feature recommendations from a validated profile.
///
/// Rules mirror plan §5b. Each recommendation names the triggering trait and the
/// evidence, so the UI can show *why* — never an unexplained suggestion.
pub fn recommend(p: &CoderProfile) -> Vec<Recommendation> {
    let mut out = Vec::new();

    use crate::schema::SessionRhythm::ShortBursts;
    let short_bursts = p.signatures.session_rhythm == ShortBursts;

    // 1. High abandon-rate + short exploratory sessions → fast multi-try + introspection.
    if abandons_quickly(p) && short_bursts {
        out.push(Recommendation {
            feature: find("best-of-n"),
            because: "you abandon quickly and work in short bursts".into(),
            evidence: format!(
                "{} of {} sessions abandoned; rhythm = short bursts",
                p.efficiency.abandoned_sessions, p.data.sessions_analyzed
            ),
        });
        out.push(Recommendation {
            feature: find("context"),
            because: "you abandon quickly — see why a thread bloated before bailing".into(),
            evidence: format!("{} context-bloat events recorded", p.efficiency.context_bloat_events),
        });
    }

    // 2. Refactor-heavy + clear decomposition → parallelism.
    if task_fraction(p, TaskCategory::Refactor) >= 0.25 {
        out.push(Recommendation {
            feature: find("parallel-terminals"),
            because: "your work is refactor-heavy".into(),
            evidence: format!("refactor = {:.0}% of task mix", task_fraction(p, TaskCategory::Refactor) * 100.0),
        });
        out.push(Recommendation {
            feature: find("subagents"),
            because: "refactors decompose well into parallel sub-tasks".into(),
            evidence: format!("refactor = {:.0}% of task mix", task_fraction(p, TaskCategory::Refactor) * 100.0),
        });
    }

    // 3. Heavy MCP reliance → Cursor's tool ceiling is a real risk for you.
    if mcp_share(p) > 0.25 {
        out.push(Recommendation {
            feature: find("skills"),
            because: "you lean heavily on MCP — mind Cursor's ~40-tool ceiling for your server set".into(),
            evidence: format!("MCP = {:.0}% of tool calls", mcp_share(p) * 100.0),
        });
    }

    out
}

/// Whether the profile shows a habit worth encoding as a rule everywhere (a
/// repeated instruction, by data or by friction tag). Feeds the Gap-Filling
/// Engine's "what to add for parity" in M5c.
pub fn has_encodable_habit(p: &CoderProfile) -> bool {
    !p.repeated_instructions.is_empty()
        || p.friction_points.iter().any(|f| f.pattern == FrictionPattern::RepeatedInstruction)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::*;

    fn base() -> CoderProfile {
        CoderProfile {
            schema_version: SCHEMA_VERSION,
            agent: Agent::Claude,
            data: DataCoverage { sessions_analyzed: 10, days_covered: 30, messages_analyzed: 500 },
            task_mix: vec![TaskShare { category: TaskCategory::Implement, fraction: 1.0 }],
            friction_points: vec![],
            repeated_instructions: vec![],
            tool_usage: ToolUsage { edit: 10, bash: 10, mcp_calls: 1, web: 1, read: 10 },
            efficiency: Efficiency {
                abandoned_sessions: 0,
                retry_loops: 0,
                context_bloat_events: 0,
                cache_reuse_ratio: 0.5,
            },
            strengths: vec![],
            agent_affinity: vec![],
            signatures: Signatures {
                repeated_phrasings: vec![],
                peak_hours: vec![9, 10, 22],
                abandon_persist: AbandonPersist::PushesThrough,
                session_rhythm: SessionRhythm::LongSessions,
                avg_session_minutes: 45.0,
            },
        }
    }

    #[test]
    fn quiet_profile_gets_no_recommendations() {
        assert!(recommend(&base()).is_empty());
    }

    #[test]
    fn abandon_plus_short_bursts_recommends_best_of_n_and_context() {
        let mut p = base();
        p.signatures.abandon_persist = AbandonPersist::AbandonsQuickly;
        p.signatures.session_rhythm = SessionRhythm::ShortBursts;
        let slugs: Vec<String> = recommend(&p).into_iter().map(|r| r.feature.slug).collect();
        assert!(slugs.contains(&"best-of-n".to_string()));
        assert!(slugs.contains(&"context".to_string()));
    }

    #[test]
    fn refactor_heavy_recommends_parallelism() {
        let mut p = base();
        p.task_mix = vec![
            TaskShare { category: TaskCategory::Refactor, fraction: 0.6 },
            TaskShare { category: TaskCategory::Implement, fraction: 0.4 },
        ];
        let slugs: Vec<String> = recommend(&p).into_iter().map(|r| r.feature.slug).collect();
        assert!(slugs.contains(&"parallel-terminals".to_string()));
        assert!(slugs.contains(&"subagents".to_string()));
    }

    #[test]
    fn heavy_mcp_flags_tool_ceiling() {
        let mut p = base();
        p.tool_usage = ToolUsage { edit: 1, bash: 1, mcp_calls: 20, web: 0, read: 1 };
        let recs = recommend(&p);
        assert!(recs.iter().any(|r| r.because.contains("40-tool ceiling")));
    }

    #[test]
    fn encodable_habit_detected_from_repeated_instructions() {
        let mut p = base();
        assert!(!has_encodable_habit(&p));
        p.repeated_instructions = vec![RepeatedInstruction {
            text: "always run tests before claiming done".into(),
            occurrences: 7,
            candidate_rule: "Run the test suite before reporting completion.".into(),
        }];
        assert!(has_encodable_habit(&p));
    }
}
