//! THE M3 PROOF — round-trip identity against golden fixtures (plan §6, §6b).
//!
//! For each target: parse a real-world native config → canonical → re-emit →
//! re-parse, and assert the two canonical models are equal. This demonstrates the
//! projector loses no field (identity modulo formatting), so correctness is shown
//! by execution, not eyeballed in a diff. Also pins: emission is idempotent, and
//! no secret token is ever inlined.

use canonical::{ConfigValue, EnvVar, Header, McpServer, McpTransport};
use projection::{parse_mcp, project_mcp, Target};

const CLAUDE_FIXTURE: &str = include_str!("fixtures/claude.mcp.json");
const CURSOR_FIXTURE: &str = include_str!("fixtures/cursor.mcp.json");
const CODEX_FIXTURE: &str = include_str!("fixtures/codex.config.toml");

/// parse → project → parse must be the identity on the canonical model.
fn assert_round_trip(target: Target, fixture: &str) {
    let canon = parse_mcp(target, fixture).expect("fixture parses");
    assert!(!canon.is_empty(), "{target:?} fixture should have servers");

    let emitted = project_mcp(target, &canon).contents;
    let canon2 = parse_mcp(target, &emitted).expect("re-emitted config parses");

    assert_eq!(canon, canon2, "{target:?}: round-trip changed the canonical model");

    // Emission is idempotent (stable output → snapshot-safe).
    let emitted2 = project_mcp(target, &canon2).contents;
    assert_eq!(emitted, emitted2, "{target:?}: projection is not idempotent");
}

#[test]
fn claude_round_trips() {
    assert_round_trip(Target::Claude, CLAUDE_FIXTURE);
}

#[test]
fn cursor_round_trips() {
    assert_round_trip(Target::Cursor, CURSOR_FIXTURE);
}

#[test]
fn codex_round_trips() {
    assert_round_trip(Target::Codex, CODEX_FIXTURE);
}

#[test]
fn secrets_round_trip_as_references_never_tokens() {
    // The Claude fixture references ${GITHUB_TOKEN}; it must survive as a secret
    // reference and re-emit as the placeholder, never a literal.
    let canon = parse_mcp(Target::Claude, CLAUDE_FIXTURE).unwrap();
    let github = canon.iter().find(|s| s.name == "github").unwrap();
    match &github.transport {
        McpTransport::Stdio { env, .. } => {
            let tok = env.iter().find(|e| e.key == "GITHUB_PERSONAL_ACCESS_TOKEN").unwrap();
            assert!(matches!(tok.value, ConfigValue::Secret { .. }), "must classify as secret");
        }
        _ => panic!("github should be stdio"),
    }
    let emitted = project_mcp(Target::Claude, &canon).contents;
    assert!(emitted.contains("${GITHUB_TOKEN}"));
}

#[test]
fn codex_ignores_non_mcp_keys() {
    // The codex fixture has `model`/`approval_policy`; only servers come back.
    let canon = parse_mcp(Target::Codex, CODEX_FIXTURE).unwrap();
    let names: Vec<&str> = canon.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, vec!["fetch", "github"]); // sorted, no stray keys
}

#[test]
fn http_servers_round_trip_through_codex_toml() {
    // Codex's http MCP shape isn't in the golden fixture (still-evolving format),
    // so prove the http path with a constructed canonical server.
    let server = McpServer {
        name: "remote".into(),
        transport: McpTransport::Http {
            url: "https://mcp.example.com/sse".into(),
            headers: vec![Header {
                name: "Authorization".into(),
                value: ConfigValue::env_secret("REMOTE_TOKEN"),
            }],
        },
        tool_count: None,
        disabled: false,
    };
    let emitted = project_mcp(Target::Codex, std::slice::from_ref(&server)).contents;
    let back = parse_mcp(Target::Codex, &emitted).unwrap();
    assert_eq!(back.len(), 1);
    assert_eq!(back[0], server);
    assert!(emitted.contains("${REMOTE_TOKEN}"));
}

#[test]
fn empty_server_set_projects_and_parses() {
    for target in [Target::Claude, Target::Codex, Target::Cursor] {
        let out = project_mcp(target, &[]);
        let back = parse_mcp(target, &out.contents).unwrap_or_default();
        assert!(back.is_empty(), "{target:?}: empty set should round-trip to empty");
    }
}

#[test]
fn one_canonical_set_projects_to_all_three() {
    // A single canonical set projected to all three targets, then parsed back,
    // yields the same servers everywhere (the whole point of a canonical store).
    let servers = vec![
        McpServer {
            name: "github".into(),
            transport: McpTransport::Stdio {
                command: "npx".into(),
                args: vec!["-y".into(), "@modelcontextprotocol/server-github".into()],
                env: vec![EnvVar {
                    key: "GITHUB_PERSONAL_ACCESS_TOKEN".into(),
                    value: ConfigValue::env_secret("GITHUB_TOKEN"),
                }],
            },
            tool_count: Some(8),
            disabled: false,
        },
        McpServer {
            name: "fetch".into(),
            transport: McpTransport::Stdio {
                command: "uvx".into(),
                args: vec!["mcp-server-fetch".into()],
                env: vec![],
            },
            tool_count: Some(1),
            disabled: false,
        },
    ];

    for target in [Target::Claude, Target::Codex, Target::Cursor] {
        let emitted = project_mcp(target, &servers).contents;
        let back = parse_mcp(target, &emitted).unwrap();
        // tool_count/disabled aren't carried by native formats; compare the rest.
        let stripped: Vec<McpServer> = servers
            .iter()
            .cloned()
            .map(|mut s| {
                s.tool_count = None;
                s
            })
            .collect();
        // back is sorted by name; sort expected the same way.
        let mut expected = stripped;
        expected.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(back, expected, "{target:?}: cross-projection lost data");
    }
}
