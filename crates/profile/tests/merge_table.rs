//! THE M5c MERGE GATE — hand-computed table test (plan §6b: the merge is
//! silent-wrong, so pin it with known inputs → exact expected output).
//!
//! Volumes are chosen so every blended number is computable by hand:
//! Claude 1500 messages, Codex 500 → total 2000 → weights 0.75 / 0.25;
//! confidences min(1, msgs/1000) = 1.0 / 0.5.

use profile::merge::*;
use profile::schema::*;

fn claude() -> CoderProfile {
    CoderProfile {
        schema_version: SCHEMA_VERSION,
        agent: Agent::Claude,
        data: DataCoverage { sessions_analyzed: 50, days_covered: 30, messages_analyzed: 1500 },
        task_mix: vec![TaskShare { category: TaskCategory::Implement, fraction: 1.0 }],
        friction_points: vec![FrictionPoint {
            pattern: FrictionPattern::RepeatedInstruction,
            evidence_examples: vec!["use logger".into()],
            which_agent: Agent::Claude,
            frequency: 8,
        }],
        repeated_instructions: vec![
            RepeatedInstruction { text: "run tests".into(), occurrences: 10, candidate_rule: "Run tests first".into() },
            RepeatedInstruction { text: "use logger".into(), occurrences: 3, candidate_rule: "Use the logger".into() },
        ],
        tool_usage: ToolUsage { edit: 100, bash: 50, mcp_calls: 10, web: 5, read: 120 },
        efficiency: Efficiency { abandoned_sessions: 5, retry_loops: 3, context_bloat_events: 2, cache_reuse_ratio: 0.6 },
        strengths: vec!["front-loads context".into()],
        agent_affinity: vec![AffinityEntry { task: TaskCategory::Refactor, preferred_agent: Agent::Claude, confidence: 0.8 }],
        signatures: Signatures {
            repeated_phrasings: vec!["keep diffs small".into()],
            peak_hours: vec![9, 10],
            abandon_persist: AbandonPersist::AbandonsQuickly,
            session_rhythm: SessionRhythm::ShortBursts,
            avg_session_minutes: 30.0,
        },
    }
}

fn codex() -> CoderProfile {
    CoderProfile {
        schema_version: SCHEMA_VERSION,
        agent: Agent::Codex,
        data: DataCoverage { sessions_analyzed: 20, days_covered: 30, messages_analyzed: 500 },
        task_mix: vec![TaskShare { category: TaskCategory::Debug, fraction: 1.0 }],
        friction_points: vec![FrictionPoint {
            pattern: FrictionPattern::RetryLoop,
            evidence_examples: vec!["retried build".into()],
            which_agent: Agent::Codex,
            frequency: 4,
        }],
        repeated_instructions: vec![RepeatedInstruction {
            text: "run tests".into(),
            occurrences: 5,
            candidate_rule: "Run tests first".into(),
        }],
        tool_usage: ToolUsage { edit: 40, bash: 60, mcp_calls: 2, web: 1, read: 30 },
        efficiency: Efficiency { abandoned_sessions: 1, retry_loops: 6, context_bloat_events: 1, cache_reuse_ratio: 0.4 },
        strengths: vec!["pushes through hard bugs".into()],
        agent_affinity: vec![AffinityEntry { task: TaskCategory::Debug, preferred_agent: Agent::Codex, confidence: 0.6 }],
        signatures: Signatures {
            repeated_phrasings: vec!["ship it".into()],
            peak_hours: vec![10, 22],
            abandon_persist: AbandonPersist::PushesThrough,
            session_rhythm: SessionRhythm::LongSessions,
            avg_session_minutes: 60.0,
        },
    }
}

fn approx(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-9, "expected {b}, got {a}");
}

#[test]
fn weights_and_confidence_are_exact() {
    let m = merge(&[claude(), codex()]);
    let c = m.agents.iter().find(|a| a.agent == Agent::Claude).unwrap();
    let x = m.agents.iter().find(|a| a.agent == Agent::Codex).unwrap();
    approx(c.weight, 0.75);
    approx(c.confidence, 1.0); // 1500/1000 capped at 1.0
    approx(x.weight, 0.25);
    approx(x.confidence, 0.5); // 500/1000
}

#[test]
fn task_mix_is_weighted_average() {
    let m = merge(&[claude(), codex()]);
    // Sorted by share desc: implement 0.75, debug 0.25.
    assert_eq!(m.task_mix[0].category, TaskCategory::Implement);
    approx(m.task_mix[0].fraction, 0.75);
    assert_eq!(m.task_mix[1].category, TaskCategory::Debug);
    approx(m.task_mix[1].fraction, 0.25);
    approx(m.task_mix.iter().map(|t| t.fraction).sum(), 1.0);
}

#[test]
fn repeated_instructions_merge_by_text() {
    let m = merge(&[claude(), codex()]);
    let run = m.repeated_instructions.iter().find(|r| r.text == "run tests").unwrap();
    assert_eq!(run.occurrences, 15); // 10 + 5
    let logger = m.repeated_instructions.iter().find(|r| r.text == "use logger").unwrap();
    assert_eq!(logger.occurrences, 3);
    // Sorted by occurrences desc → "run tests" first.
    assert_eq!(m.repeated_instructions[0].text, "run tests");
}

#[test]
fn friction_is_unioned_sorted_by_frequency() {
    let m = merge(&[claude(), codex()]);
    assert_eq!(m.friction_points.len(), 2);
    assert_eq!(m.friction_points[0].pattern, FrictionPattern::RepeatedInstruction); // freq 8
    assert_eq!(m.friction_points[1].pattern, FrictionPattern::RetryLoop); // freq 4
}

#[test]
fn signatures_blend_numeric_and_pick_dominant_categorical() {
    let m = merge(&[claude(), codex()]);
    approx(m.signatures.avg_session_minutes, 37.5); // 0.75*30 + 0.25*60
    assert_eq!(m.signatures.peak_hours, vec![9, 10, 22]); // union, sorted, unique
    // Claude (0.75) dominates the tendencies.
    assert_eq!(m.signatures.abandon_persist, AbandonPersist::AbandonsQuickly);
    assert_eq!(m.signatures.session_rhythm, SessionRhythm::ShortBursts);
}

#[test]
fn strengths_and_tool_usage_are_preserved() {
    let m = merge(&[claude(), codex()]);
    assert!(m.strengths.contains(&"front-loads context".to_string()));
    assert!(m.strengths.contains(&"pushes through hard bugs".to_string()));
    assert_eq!(m.tool_usage_by_agent.len(), 2);
}

#[test]
fn single_profile_merges_to_itself_weight_one() {
    let m = merge(&[claude()]);
    approx(m.agents[0].weight, 1.0);
    approx(m.agents[0].confidence, 1.0);
    approx(m.signatures.avg_session_minutes, 30.0);
}

#[test]
fn all_thin_history_falls_back_to_equal_weights() {
    // Both report zero volume → equal weights, zero confidence (honest).
    let mut a = claude();
    a.data = DataCoverage { sessions_analyzed: 0, days_covered: 0, messages_analyzed: 0 };
    let mut b = codex();
    b.data = DataCoverage { sessions_analyzed: 0, days_covered: 0, messages_analyzed: 0 };
    let m = merge(&[a, b]);
    approx(m.agents[0].weight, 0.5);
    approx(m.agents[1].weight, 0.5);
    approx(m.agents[0].confidence, 0.0);
}
