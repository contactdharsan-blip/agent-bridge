//! The cross-agent profile layer — the differentiating moat (plan §5b).
//!
//! - [`schema`] — the strict `CoderProfile` contract + boundary validator. One
//!   shared schema is what makes three agents' outputs comparable.
//! - [`platform`] — the platform-feature map + profile→feature matching (the
//!   personalization payload, FR20a).
//!
//! Merge (confidence-weighted), the Gap-Filling Engine, and the Workflow
//! Continuity Report build on these in M5c. Everything here is pure and
//! local-first: only validated aggregate JSON flows in, never raw transcripts.

pub mod platform;
pub mod schema;

pub use platform::{
    feature_catalog, has_encodable_habit, recommend, PlatformFeature, Recommendation,
};
pub use schema::{
    parse_profile, AbandonPersist, Agent, AffinityEntry, CoderProfile, DataCoverage, Efficiency,
    FrictionPattern, FrictionPoint, ProfileError, RepeatedInstruction, SessionRhythm, Signatures,
    TaskCategory, TaskShare, ToolUsage, SCHEMA_VERSION,
};
