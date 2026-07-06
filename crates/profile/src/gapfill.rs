//! The Gap-Filling Engine — when a capability doesn't map one-to-one between
//! harnesses, resolve it with a skill (plan §5b "Gap-Filling Engine", FR22a/b).
//!
//! Two modes, tried in order:
//! 1. **Recommend an existing skill** from a curated index (cheapest; source is
//!    surfaced, never auto-installed).
//! 2. **Generate a custom skill** — capability-replicating or profile-specific —
//!    as a reviewable `SKILL.md`, or a canonical **rule** projected everywhere.
//!
//! Every fill is tagged [`Equivalence::Equivalent`] vs [`Equivalence::Approximation`]
//! (a skill can replace a *behavior*, not always a runtime *integration*), the
//! same honesty discipline as instructions projection (FR22b).

use serde::{Deserialize, Serialize};

use crate::merge::MergedProfile;
use crate::schema::{Agent, FrictionPattern};

/// Honest strength of a gap-fill (FR22b).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Equivalence {
    /// The skill fully reproduces the missing behavior.
    Equivalent,
    /// The skill approximates it (e.g. can't read a live runtime window).
    Approximation,
}

/// How a gap is resolved.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Resolution {
    /// Recommend an existing skill. `source` is shown to the user before any
    /// install — third-party code is untrusted until reviewed (FR22b).
    Marketplace {
        /// Skill name.
        name: String,
        /// Where it comes from (a URL, or `bundled:...` for our own).
        source: String,
    },
    /// A freshly generated skill, presented as a reviewable `SKILL.md` diff.
    GeneratedSkill {
        /// Skill folder name.
        name: String,
        /// Full `SKILL.md` contents for review.
        skill_md: String,
    },
    /// A canonical instruction rule to add — projected into each agent's native
    /// instruction file by the Projection Engine (encodes a habit everywhere).
    Rule {
        /// The rule text to add to the canonical instructions doc.
        canonical_rule: String,
    },
}

/// One resolved gap.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GapFill {
    /// Human name of the missing capability.
    pub capability: String,
    /// Target agent the capability is missing from.
    pub target: Agent,
    /// Equivalent vs approximation.
    pub equivalence: Equivalence,
    /// The friction/profile signal (or feature gap) that motivated this fill.
    pub motivation: String,
    /// How it's resolved.
    pub resolution: Resolution,
    /// True when synthesized from this user's own data (the most defensible
    /// output — can't be copied from a marketplace).
    pub profile_specific: bool,
}

/// A known capability one harness has natively and others lack.
struct CapabilityGap {
    capability: &'static str,
    native_to: Agent,
    missing_from: &'static [Agent],
    equivalence: Equivalence,
    /// `Some(name, source)` to recommend an indexed/bundled skill; `None` to
    /// generate one.
    bundled: Option<(&'static str, &'static str)>,
}

/// The curated capability-gap index (plan §5b). Small and explicit; the marketplace
/// mode draws from `bundled`, generation mode handles the rest.
fn capability_index() -> Vec<CapabilityGap> {
    vec![
        // Claude's /insights has no Codex/Cursor equivalent → our own Profile
        // Skill *is* the capability-replicating fill (the pattern, dogfooded).
        CapabilityGap {
            capability: "Cross-tool usage analysis (Claude /insights)",
            native_to: Agent::Claude,
            missing_from: &[Agent::Codex, Agent::Cursor],
            equivalence: Equivalence::Equivalent,
            bundled: Some((
                "agent-bridge-profile",
                "https://github.com/contactdharsan-blip/agent-bridge-profile-skill",
            )),
        },
        // /context reads the live token window — a skill can only estimate from
        // observable history → approximation, generated.
        CapabilityGap {
            capability: "Context-budget introspection (Claude /context)",
            native_to: Agent::Claude,
            missing_from: &[Agent::Codex, Agent::Cursor],
            equivalence: Equivalence::Approximation,
            bundled: None,
        },
    ]
}

/// SKILL.md for a generated context-budget reporter (the /context approximation).
fn context_reporter_skill() -> String {
    "---\n\
     name: context-budget-reporter\n\
     description: Approximate a /context-style report — estimate how much of the \
     context window the current session is using, from observable signals, and \
     flag when a thread is bloating. Use when the host agent has no native \
     /context command.\n\
     ---\n\
     \n\
     # Context-budget reporter (approximation)\n\
     \n\
     This skill **approximates** Claude's `/context`. It cannot read the live token\n\
     window the way the native command does, so treat its numbers as estimates.\n\
     \n\
     1. Estimate tokens in the current session from message lengths (~4 chars/token).\n\
     2. Compare against the host model's known window; report % used.\n\
     3. Flag the largest contributors (long tool outputs, pasted files) and suggest\n\
     trimming or starting a fresh thread before abandoning the task.\n\
     \n\
     Report as a short table. Be explicit that this is an estimate, not the real\n\
     runtime window.\n"
        .to_string()
}

/// SKILL.md for a generated verify-first skill (profile-specific, from
/// premature-solution friction).
fn verify_first_skill() -> String {
    "---\n\
     name: verify-before-solving\n\
     description: Force codebase verification before proposing a fix. Use at the \
     start of any debug/implement task to check assumptions against the real code \
     first.\n\
     ---\n\
     \n\
     # Verify before solving\n\
     \n\
     Generated from your measured friction: jumping to a solution before checking\n\
     the codebase. Before proposing a change:\n\
     \n\
     1. Locate the actual definition/usage in the repo (don't assume the API).\n\
     2. State the assumption you're testing and the evidence for it.\n\
     3. Only then propose the fix, referencing the file:line you verified.\n"
        .to_string()
}

/// Resolve gaps for moving work to `target`: capability gaps from the index plus
/// profile-specific gaps synthesized from this user's data.
pub fn gap_fills(target: Agent, profile: &MergedProfile) -> Vec<GapFill> {
    let mut out = Vec::new();

    // 1. Capability gaps the target lacks natively.
    for gap in capability_index() {
        if !gap.missing_from.contains(&target) {
            continue;
        }
        let resolution = match gap.bundled {
            Some((name, source)) => Resolution::Marketplace { name: name.into(), source: source.into() },
            None => match gap.capability {
                c if c.contains("/context") => Resolution::GeneratedSkill {
                    name: "context-budget-reporter".into(),
                    skill_md: context_reporter_skill(),
                },
                _ => Resolution::GeneratedSkill {
                    name: "generated-skill".into(),
                    skill_md: String::new(),
                },
            },
        };
        out.push(GapFill {
            capability: gap.capability.into(),
            target,
            equivalence: gap.equivalence,
            motivation: format!("native to {:?}, missing from {:?}", gap.native_to, target),
            resolution,
            profile_specific: false,
        });
    }

    // 2. Profile-specific: encode each repeated instruction as a rule everywhere.
    for ri in &profile.repeated_instructions {
        out.push(GapFill {
            capability: format!("Encode habit: \"{}\"", ri.text),
            target,
            equivalence: Equivalence::Equivalent,
            motivation: format!("repeated across {} sessions", ri.occurrences),
            resolution: Resolution::Rule { canonical_rule: ri.candidate_rule.clone() },
            profile_specific: true,
        });
    }

    // 3. Profile-specific: a verify-first skill if premature-solution friction shows up.
    if profile
        .friction_points
        .iter()
        .any(|f| f.pattern == FrictionPattern::PrematureSolution)
    {
        out.push(GapFill {
            capability: "Verify-before-solving discipline".into(),
            target,
            equivalence: Equivalence::Equivalent,
            motivation: "measured premature-solution friction".into(),
            resolution: Resolution::GeneratedSkill {
                name: "verify-before-solving".into(),
                skill_md: verify_first_skill(),
            },
            profile_specific: true,
        });
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::merge::MergedSignatures;
    use crate::schema::*;

    fn merged_with(
        instructions: Vec<RepeatedInstruction>,
        friction: Vec<FrictionPoint>,
    ) -> MergedProfile {
        MergedProfile {
            agents: vec![],
            task_mix: vec![],
            friction_points: friction,
            repeated_instructions: instructions,
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
    fn moving_to_codex_surfaces_insights_and_context_gaps() {
        let m = merged_with(vec![], vec![]);
        let fills = gap_fills(Agent::Codex, &m);
        // /insights → bundled Profile Skill (marketplace mode), equivalent.
        let insights = fills.iter().find(|f| f.capability.contains("/insights")).unwrap();
        assert!(matches!(insights.resolution, Resolution::Marketplace { .. }));
        assert_eq!(insights.equivalence, Equivalence::Equivalent);
        // /context → generated, honestly marked approximation.
        let context = fills.iter().find(|f| f.capability.contains("/context")).unwrap();
        assert!(matches!(context.resolution, Resolution::GeneratedSkill { .. }));
        assert_eq!(context.equivalence, Equivalence::Approximation);
    }

    #[test]
    fn claude_target_has_no_native_capability_gaps() {
        let m = merged_with(vec![], vec![]);
        let fills = gap_fills(Agent::Claude, &m);
        // Claude owns /insights and /context natively → no capability gaps,
        // only profile-specific fills (none here).
        assert!(fills.iter().all(|f| f.profile_specific));
    }

    #[test]
    fn repeated_instruction_becomes_a_projected_rule() {
        let m = merged_with(
            vec![RepeatedInstruction {
                text: "run tests first".into(),
                occurrences: 12,
                candidate_rule: "Run the full test suite before claiming done.".into(),
            }],
            vec![],
        );
        let fills = gap_fills(Agent::Cursor, &m);
        let rule = fills.iter().find(|f| f.capability.starts_with("Encode habit")).unwrap();
        assert!(rule.profile_specific);
        match &rule.resolution {
            Resolution::Rule { canonical_rule } => assert!(canonical_rule.contains("test suite")),
            _ => panic!("expected a Rule resolution"),
        }
    }

    #[test]
    fn premature_solution_friction_generates_verify_first_skill() {
        let m = merged_with(
            vec![],
            vec![FrictionPoint {
                pattern: FrictionPattern::PrematureSolution,
                evidence_examples: vec!["proposed a fix before reading the file".into()],
                which_agent: Agent::Claude,
                frequency: 5,
            }],
        );
        let fills = gap_fills(Agent::Codex, &m);
        let v = fills.iter().find(|f| f.capability.contains("Verify-before-solving")).unwrap();
        match &v.resolution {
            Resolution::GeneratedSkill { skill_md, .. } => assert!(skill_md.contains("Verify before solving")),
            _ => panic!("expected a generated skill"),
        }
    }
}
