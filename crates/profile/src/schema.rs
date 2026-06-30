//! The strict `CoderProfile` schema and its boundary validator (plan §5b, PRD
//! FR16–FR19).
//!
//! The Profile Skill runs inside each agent and emits JSON against *this* schema.
//! Because the taxonomy is closed (categorical fields are enums) and unknown
//! fields are rejected, three agents' outputs are comparable by construction —
//! the whole premise of "one shared instruction up front" instead of three
//! brittle parsers after the fact.
//!
//! Strictness is the point (the 🟡 requirement): [`parse_profile`] deserializes
//! with `deny_unknown_fields` (serde rejects extra/typo'd keys) and then runs
//! [`CoderProfile::validate`] (range/sum checks). Non-conforming output is
//! *rejected at the boundary* so a loose-JSON bug can't silently corrupt the
//! confidence-weighted merge downstream.

use serde::{Deserialize, Serialize};

/// Current schema version. The skill must stamp this; a mismatch is rejected so
/// an old skill's output can't be merged against new merge logic.
pub const SCHEMA_VERSION: u32 = 1;

/// Tolerance for the task-mix fractions summing to 1.0.
const SUM_TOLERANCE: f64 = 0.02;

/// Which agent produced (or is referenced by) a piece of profile data. Closed
/// enum so cross-agent comparison is exact.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    /// Claude Code.
    Claude,
    /// Codex.
    Codex,
    /// Cursor.
    Cursor,
}

/// Normalized task category. Closed taxonomy shared across agents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskCategory {
    /// Diagnosing/fixing defects.
    Debug,
    /// Building new functionality.
    Implement,
    /// Restructuring without behavior change.
    Refactor,
    /// Writing/maintaining tests.
    Tests,
    /// Documentation.
    Docs,
    /// Infra / build / deploy / config.
    Infra,
    /// Reviewing code.
    Review,
    /// Open-ended exploration / understanding.
    Explore,
    /// Anything not captured above.
    Other,
}

/// Closed friction taxonomy. Structured so the merge can aggregate by pattern;
/// free-text evidence carries the specifics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FrictionPattern {
    /// Jumping to a solution before verifying against the codebase.
    PrematureSolution,
    /// The same instruction repeated across sessions (a missing rule).
    RepeatedInstruction,
    /// Threads growing until context is bloated.
    ContextBloat,
    /// Retrying the same failing approach in a loop.
    RetryLoop,
    /// Abandoning a path the moment it stalls.
    AbandonOnStall,
    /// Tool/command misfires (wrong args, failed calls).
    ToolMisfire,
    /// Auth/login friction interrupting flow.
    AuthFriction,
    /// Scope expanding mid-task.
    ScopeCreep,
    /// Anything else.
    Other,
}

/// Tendency to abandon vs push through when a path stalls.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AbandonPersist {
    /// Abandons quickly when stuck.
    AbandonsQuickly,
    /// Pushes through obstacles.
    PushesThrough,
    /// Mixed / context-dependent.
    Mixed,
}

/// Characteristic session length pattern.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionRhythm {
    /// Many short bursts.
    ShortBursts,
    /// Fewer long sessions.
    LongSessions,
    /// Mixed.
    Mixed,
}

/// How much history the skill actually saw — the basis for per-agent confidence
/// (FR19). Merge weights by data *volume*, not tooling quality.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DataCoverage {
    /// Number of sessions analyzed.
    pub sessions_analyzed: u32,
    /// Calendar days the history spans.
    pub days_covered: u32,
    /// Number of messages/turns analyzed.
    pub messages_analyzed: u32,
}

/// One category's share of the task mix (`fraction` in `[0, 1]`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TaskShare {
    /// The category.
    pub category: TaskCategory,
    /// Share of activity, `0.0..=1.0`.
    pub fraction: f64,
}

/// A detected friction pattern with evidence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FrictionPoint {
    /// Closed pattern tag.
    pub pattern: FrictionPattern,
    /// Short, anonymized evidence snippets (never raw transcript dumps — NFR1).
    pub evidence_examples: Vec<String>,
    /// Which agent the pattern was observed in.
    pub which_agent: Agent,
    /// How often it recurred.
    pub frequency: u32,
}

/// A recurring instruction the user types repeatedly → a candidate rule.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RepeatedInstruction {
    /// The recurring instruction text (normalized).
    pub text: String,
    /// How many sessions it appeared in.
    pub occurrences: u32,
    /// A rule that would encode the habit so it needn't be repeated.
    pub candidate_rule: String,
}

/// Tool-reach counts for this agent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ToolUsage {
    /// File edits.
    pub edit: u32,
    /// Shell/bash calls.
    pub bash: u32,
    /// MCP tool calls.
    pub mcp_calls: u32,
    /// Web/search calls.
    pub web: u32,
    /// File reads.
    pub read: u32,
}

/// Efficiency signals.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Efficiency {
    /// Sessions abandoned without resolution.
    pub abandoned_sessions: u32,
    /// Retry loops observed.
    pub retry_loops: u32,
    /// Context-bloat events.
    pub context_bloat_events: u32,
    /// Prompt-cache reuse ratio, `0.0..=1.0`.
    pub cache_reuse_ratio: f64,
}

/// Which agent the user reaches for, for a given task type.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AffinityEntry {
    /// Task type.
    pub task: TaskCategory,
    /// Preferred agent for it.
    pub preferred_agent: Agent,
    /// Confidence `0.0..=1.0`.
    pub confidence: f64,
}

/// The high-dimensional fingerprint (FR18) — what makes a profile feel like a
/// specific person, not a template.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Signatures {
    /// Characteristic phrasings the user repeats.
    pub repeated_phrasings: Vec<String>,
    /// Peak active hours (each `0..=23`).
    pub peak_hours: Vec<u8>,
    /// Abandon-vs-persist tendency.
    pub abandon_persist: AbandonPersist,
    /// Session-length rhythm.
    pub session_rhythm: SessionRhythm,
    /// Average session length in minutes.
    pub avg_session_minutes: f64,
}

/// The full per-agent profile the skill emits. One per agent; merged in M5c.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CoderProfile {
    /// Must equal [`SCHEMA_VERSION`].
    pub schema_version: u32,
    /// Which agent produced this profile.
    pub agent: Agent,
    /// How much data backed it (→ confidence).
    pub data: DataCoverage,
    /// Normalized task mix (fractions sum to ~1).
    pub task_mix: Vec<TaskShare>,
    /// Friction points with evidence.
    pub friction_points: Vec<FrictionPoint>,
    /// Repeated instructions → candidate rules.
    pub repeated_instructions: Vec<RepeatedInstruction>,
    /// Tool-reach counts.
    pub tool_usage: ToolUsage,
    /// Efficiency signals.
    pub efficiency: Efficiency,
    /// What the user does well.
    pub strengths: Vec<String>,
    /// Per-task agent affinity.
    pub agent_affinity: Vec<AffinityEntry>,
    /// High-dimensional fingerprint.
    pub signatures: Signatures,
}

/// Why a profile JSON was rejected at the boundary.
#[derive(Debug, thiserror::Error, PartialEq)]
pub enum ProfileError {
    /// The bytes weren't valid JSON, had unknown/missing fields, or wrong types.
    #[error("profile JSON did not match the schema: {0}")]
    Json(String),
    /// `schema_version` didn't match what this build understands.
    #[error("schema version {found} != supported {expected}")]
    SchemaVersion {
        /// Version found in the payload.
        found: u32,
        /// Version this build supports.
        expected: u32,
    },
    /// A value was outside its allowed range.
    #[error("{field} out of range: {detail}")]
    OutOfRange {
        /// Offending field.
        field: String,
        /// What was wrong.
        detail: String,
    },
}

impl CoderProfile {
    /// Range/sum checks beyond what the type system enforces. Serde already
    /// guarantees closed enums, required fields, and no unknown keys.
    pub fn validate(&self) -> Result<(), ProfileError> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(ProfileError::SchemaVersion {
                found: self.schema_version,
                expected: SCHEMA_VERSION,
            });
        }

        for ts in &self.task_mix {
            check_unit("taskMix.fraction", ts.fraction)?;
        }
        // Task mix should be a distribution. Allow empty (no data) but if present
        // it must sum to ~1.
        if !self.task_mix.is_empty() {
            let sum: f64 = self.task_mix.iter().map(|t| t.fraction).sum();
            if (sum - 1.0).abs() > SUM_TOLERANCE {
                return Err(ProfileError::OutOfRange {
                    field: "taskMix".into(),
                    detail: format!("fractions sum to {sum:.3}, expected ~1.0"),
                });
            }
        }

        check_unit("efficiency.cacheReuseRatio", self.efficiency.cache_reuse_ratio)?;
        for a in &self.agent_affinity {
            check_unit("agentAffinity.confidence", a.confidence)?;
        }
        for (i, h) in self.signatures.peak_hours.iter().enumerate() {
            if *h > 23 {
                return Err(ProfileError::OutOfRange {
                    field: format!("signatures.peakHours[{i}]"),
                    detail: format!("{h} > 23"),
                });
            }
        }
        if self.signatures.avg_session_minutes < 0.0 {
            return Err(ProfileError::OutOfRange {
                field: "signatures.avgSessionMinutes".into(),
                detail: "negative".into(),
            });
        }
        Ok(())
    }
}

/// Ensure a value is within `0.0..=1.0`.
fn check_unit(field: &str, v: f64) -> Result<(), ProfileError> {
    if !(0.0..=1.0).contains(&v) || v.is_nan() {
        return Err(ProfileError::OutOfRange {
            field: field.to_string(),
            detail: format!("{v} not in [0,1]"),
        });
    }
    Ok(())
}

/// Parse + validate a profile JSON at the boundary. The ONLY way to get a
/// [`CoderProfile`] from untrusted skill output — rejects anything non-conforming.
pub fn parse_profile(json: &str) -> Result<CoderProfile, ProfileError> {
    let profile: CoderProfile =
        serde_json::from_str(json).map_err(|e| ProfileError::Json(e.to_string()))?;
    profile.validate()?;
    Ok(profile)
}
