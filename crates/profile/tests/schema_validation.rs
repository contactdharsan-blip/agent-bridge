//! M5b proof — the boundary is strict. The example profile (the same one the
//! Profile Skill targets) validates; every class of malformed output is rejected.

use profile::{parse_profile, ProfileError, SCHEMA_VERSION};

const EXAMPLE: &str = include_str!("fixtures/example_profile.json");
/// The example shipped *inside the skill* — must stay schema-valid, since the
/// skill tells the agent to "match its shape exactly".
const SHIPPED_SKILL_EXAMPLE: &str = include_str!("../../../skills/profile/example_output.json");

#[test]
fn the_skills_example_output_validates() {
    let p = parse_profile(EXAMPLE).expect("example profile must validate");
    assert_eq!(p.schema_version, SCHEMA_VERSION);
    // The matcher should find real recommendations for this person.
    let recs = profile::recommend(&p);
    assert!(!recs.is_empty(), "a refactor-heavy, short-burst profile should match features");
}

#[test]
fn shipped_skill_example_matches_the_validator() {
    // Guards against the skill's worked example drifting from the Rust schema.
    parse_profile(SHIPPED_SKILL_EXAMPLE).expect("skills/profile/example_output.json must validate");
}

#[test]
fn unknown_field_is_rejected() {
    let bad = EXAMPLE.replacen("\"schemaVersion\": 1,", "\"schemaVersion\": 1, \"bogus\": true,", 1);
    let err = parse_profile(&bad).unwrap_err();
    assert!(matches!(err, ProfileError::Json(_)), "deny_unknown_fields must reject extras");
}

#[test]
fn wrong_schema_version_is_rejected() {
    let bad = EXAMPLE.replacen("\"schemaVersion\": 1", "\"schemaVersion\": 999", 1);
    let err = parse_profile(&bad).unwrap_err();
    assert!(matches!(err, ProfileError::SchemaVersion { found: 999, .. }));
}

#[test]
fn task_mix_that_does_not_sum_to_one_is_rejected() {
    // Drop a 0.35 slice so the mix sums to 0.65.
    let bad = EXAMPLE.replacen("{ \"category\": \"refactor\", \"fraction\": 0.35 },\n", "", 1);
    let err = parse_profile(&bad).unwrap_err();
    assert!(matches!(err, ProfileError::OutOfRange { ref field, .. } if field == "taskMix"));
}

#[test]
fn out_of_range_value_is_rejected() {
    let bad = EXAMPLE.replacen("\"cacheReuseRatio\": 0.62", "\"cacheReuseRatio\": 1.7", 1);
    let err = parse_profile(&bad).unwrap_err();
    assert!(matches!(err, ProfileError::OutOfRange { .. }));
}

#[test]
fn unknown_enum_variant_is_rejected() {
    // "sideways" is not a TaskCategory.
    let bad = EXAMPLE.replacen("\"category\": \"refactor\"", "\"category\": \"sideways\"", 1);
    let err = parse_profile(&bad).unwrap_err();
    assert!(matches!(err, ProfileError::Json(_)), "closed enum must reject unknown variants");
}

#[test]
fn peak_hour_above_23_is_rejected() {
    let bad = EXAMPLE.replacen("\"peakHours\": [9, 10, 11, 22, 23]", "\"peakHours\": [9, 25]", 1);
    let err = parse_profile(&bad).unwrap_err();
    assert!(matches!(err, ProfileError::OutOfRange { .. }));
}
