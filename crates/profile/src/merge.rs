//! Confidence-weighted merge of per-agent profiles into one cross-agent picture
//! (plan §5b, PRD FR19).
//!
//! 🟡, and the plan's named silent-wrong hazard: a subtly wrong weight produces a
//! *plausible but inaccurate* profile nobody notices. Defenses:
//! - **Fully deterministic** weighting from data volume, so the result is
//!   reproducible and table-testable.
//! - **weight vs confidence are separate.** `weight` is the relative share used
//!   to blend (sums to 1 across agents). `confidence` is an absolute 0..1 score
//!   of how much data backs that agent — surfaced per agent so thin history is
//!   visible (FR19), not hidden inside the blend.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::schema::{
    AbandonPersist, Agent, AffinityEntry, CoderProfile, FrictionPoint, RepeatedInstruction,
    SessionRhythm, TaskCategory, TaskShare, ToolUsage,
};

/// Messages-analyzed count that earns full (1.0) per-agent confidence.
const CONFIDENCE_FULL: f64 = 1000.0;

/// Per-agent blend weight + absolute confidence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWeight {
    /// Which agent.
    pub agent: Agent,
    /// Relative blend weight (weights across agents sum to 1).
    pub weight: f64,
    /// Absolute data-backed confidence, `0..1` (FR19).
    pub confidence: f64,
}

/// One agent's tool-usage counts, retained per-agent (tool reach isn't blended —
/// it's inherently per-agent).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolUsage {
    /// Agent.
    pub agent: Agent,
    /// Its tool usage.
    pub usage: ToolUsage,
}

/// Blended fingerprint.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedSignatures {
    /// Union of characteristic phrasings.
    pub repeated_phrasings: Vec<String>,
    /// Union of peak hours (sorted, unique).
    pub peak_hours: Vec<u8>,
    /// Weight-dominant abandon/persist tendency.
    pub abandon_persist: AbandonPersist,
    /// Weight-dominant session rhythm.
    pub session_rhythm: SessionRhythm,
    /// Weighted-average session length.
    pub avg_session_minutes: f64,
}

/// The merged cross-agent profile.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedProfile {
    /// Per-agent weight + confidence (the honesty surface).
    pub agents: Vec<AgentWeight>,
    /// Blended, normalized task mix.
    pub task_mix: Vec<TaskShare>,
    /// Union of friction points (each keeps its `which_agent`).
    pub friction_points: Vec<FrictionPoint>,
    /// Repeated instructions, merged by text (occurrences summed).
    pub repeated_instructions: Vec<RepeatedInstruction>,
    /// Tool usage retained per agent.
    pub tool_usage_by_agent: Vec<AgentToolUsage>,
    /// Union of strengths (deduped).
    pub strengths: Vec<String>,
    /// Union of per-task affinities.
    pub agent_affinity: Vec<AffinityEntry>,
    /// Blended fingerprint.
    pub signatures: MergedSignatures,
}

/// Data-volume scalar driving the weights. Messages are the densest signal;
/// fall back to sessions when an agent reports no message count.
fn volume(p: &CoderProfile) -> f64 {
    if p.data.messages_analyzed > 0 {
        p.data.messages_analyzed as f64
    } else {
        p.data.sessions_analyzed as f64
    }
}

/// Merge 1..3 per-agent profiles into one. Deterministic.
pub fn merge(profiles: &[CoderProfile]) -> MergedProfile {
    let volumes: Vec<f64> = profiles.iter().map(volume).collect();
    let total: f64 = volumes.iter().sum();
    let n = profiles.len().max(1) as f64;

    // Relative blend weights: by volume, or equal if there's no volume at all.
    let weights: Vec<f64> = volumes
        .iter()
        .map(|v| if total > 0.0 { v / total } else { 1.0 / n })
        .collect();

    let agents: Vec<AgentWeight> = profiles
        .iter()
        .zip(&weights)
        .zip(&volumes)
        .map(|((p, &w), &v)| AgentWeight {
            agent: p.agent,
            weight: w,
            confidence: (v / CONFIDENCE_FULL).min(1.0),
        })
        .collect();

    MergedProfile {
        agents,
        task_mix: blend_task_mix(profiles, &weights),
        friction_points: union_friction(profiles),
        repeated_instructions: merge_instructions(profiles),
        tool_usage_by_agent: profiles
            .iter()
            .map(|p| AgentToolUsage { agent: p.agent, usage: p.tool_usage.clone() })
            .collect(),
        strengths: union_strings(profiles.iter().flat_map(|p| p.strengths.iter().cloned())),
        agent_affinity: union_affinity(profiles),
        signatures: blend_signatures(profiles, &weights),
    }
}

/// Weighted average of task-mix fractions per category (result sums to ~1).
fn blend_task_mix(profiles: &[CoderProfile], weights: &[f64]) -> Vec<TaskShare> {
    let mut acc: BTreeMap<String, (TaskCategory, f64)> = BTreeMap::new();
    for (p, &w) in profiles.iter().zip(weights) {
        for ts in &p.task_mix {
            let key = format!("{:?}", ts.category);
            let entry = acc.entry(key).or_insert((ts.category, 0.0));
            entry.1 += w * ts.fraction;
        }
    }
    let mut out: Vec<TaskShare> = acc
        .into_values()
        .filter(|(_, f)| *f > 0.0)
        .map(|(category, fraction)| TaskShare { category, fraction })
        .collect();
    // Stable order: largest share first, then by category name.
    out.sort_by(|a, b| {
        b.fraction
            .partial_cmp(&a.fraction)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| format!("{:?}", a.category).cmp(&format!("{:?}", b.category)))
    });
    out
}

/// Union of all friction points, deduped, stable-sorted by frequency desc.
fn union_friction(profiles: &[CoderProfile]) -> Vec<FrictionPoint> {
    let mut out: Vec<FrictionPoint> = Vec::new();
    for p in profiles {
        for f in &p.friction_points {
            if !out.contains(f) {
                out.push(f.clone());
            }
        }
    }
    out.sort_by(|a, b| {
        b.frequency
            .cmp(&a.frequency)
            .then_with(|| format!("{:?}", a.pattern).cmp(&format!("{:?}", b.pattern)))
    });
    out
}

/// Merge repeated instructions by exact text; sum occurrences, keep first rule.
fn merge_instructions(profiles: &[CoderProfile]) -> Vec<RepeatedInstruction> {
    let mut acc: BTreeMap<String, RepeatedInstruction> = BTreeMap::new();
    for p in profiles {
        for ri in &p.repeated_instructions {
            acc.entry(ri.text.clone())
                .and_modify(|e| e.occurrences += ri.occurrences)
                .or_insert_with(|| ri.clone());
        }
    }
    let mut out: Vec<RepeatedInstruction> = acc.into_values().collect();
    out.sort_by(|a, b| b.occurrences.cmp(&a.occurrences).then_with(|| a.text.cmp(&b.text)));
    out
}

/// Union of per-task affinities (deduped, stable order).
fn union_affinity(profiles: &[CoderProfile]) -> Vec<AffinityEntry> {
    let mut out: Vec<AffinityEntry> = Vec::new();
    for p in profiles {
        for a in &p.agent_affinity {
            if !out.contains(a) {
                out.push(a.clone());
            }
        }
    }
    out.sort_by(|a, b| format!("{:?}", a.task).cmp(&format!("{:?}", b.task)));
    out
}

/// First-seen-preserving, deduped union of strings.
fn union_strings(items: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for s in items {
        if seen.insert(s.clone()) {
            out.push(s);
        }
    }
    out.sort();
    out
}

/// Blend the fingerprint: weighted numeric average, union of lists, and
/// weight-dominant choice for the categorical tendencies.
fn blend_signatures(profiles: &[CoderProfile], weights: &[f64]) -> MergedSignatures {
    let avg = profiles
        .iter()
        .zip(weights)
        .map(|(p, &w)| w * p.signatures.avg_session_minutes)
        .sum();

    let mut hours: Vec<u8> = profiles.iter().flat_map(|p| p.signatures.peak_hours.clone()).collect();
    hours.sort_unstable();
    hours.dedup();

    MergedSignatures {
        repeated_phrasings: union_strings(
            profiles.iter().flat_map(|p| p.signatures.repeated_phrasings.iter().cloned()),
        ),
        peak_hours: hours,
        abandon_persist: dominant_abandon(profiles, weights),
        session_rhythm: dominant_rhythm(profiles, weights),
        avg_session_minutes: avg,
    }
}

/// Pick the abandon/persist tendency with the most weight behind it.
fn dominant_abandon(profiles: &[CoderProfile], weights: &[f64]) -> AbandonPersist {
    use AbandonPersist::*;
    let variants = [AbandonsQuickly, PushesThrough, Mixed];
    *variants
        .iter()
        .max_by(|a, b| {
            let wa = weight_for(profiles, weights, |p| p.signatures.abandon_persist == **a);
            let wb = weight_for(profiles, weights, |p| p.signatures.abandon_persist == **b);
            wa.partial_cmp(&wb).unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap()
}

/// Pick the session rhythm with the most weight behind it.
fn dominant_rhythm(profiles: &[CoderProfile], weights: &[f64]) -> SessionRhythm {
    use SessionRhythm::*;
    let variants = [ShortBursts, LongSessions, Mixed];
    *variants
        .iter()
        .max_by(|a, b| {
            let wa = weight_for(profiles, weights, |p| p.signatures.session_rhythm == **a);
            let wb = weight_for(profiles, weights, |p| p.signatures.session_rhythm == **b);
            wa.partial_cmp(&wb).unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap()
}

/// Sum of weights of profiles matching a predicate.
fn weight_for(profiles: &[CoderProfile], weights: &[f64], pred: impl Fn(&CoderProfile) -> bool) -> f64 {
    profiles.iter().zip(weights).filter(|(p, _)| pred(p)).map(|(_, &w)| w).sum()
}
