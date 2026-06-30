//! Offline 🔴 transport test: drive the REAL [`AcpHostHandle`] against a real
//! subprocess (the `fake_agent` bin) speaking real ACP over stdio.
//!
//! No API key, no network — yet it exercises the actual transport mechanics that
//! a diff review cannot vouch for: spawning, the JSON-RPC handshake, session
//! creation, streamed updates, a server→client permission request, and the
//! accept→edit→stop round-trip. This is the offline counterpart to the real-
//! adapter gate test (`round_trip.rs`).

use std::time::Duration;

use acp_host::{AcpHost, AcpHostHandle, AdapterSpec, AgentEvent, Decision, SessionConfig};
use tokio::sync::mpsc;
use tokio::time::timeout;

/// Path to the compiled `fake_agent` binary (Cargo sets this for integration tests).
const FAKE_AGENT: &str = env!("CARGO_BIN_EXE_fake_agent");

/// Bound on each await so a transport hang fails loudly instead of stalling CI.
const STEP_TIMEOUT: Duration = Duration::from_secs(30);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn full_vertical_slice_against_fake_agent() {
    let dir = tempfile::tempdir().unwrap();
    let outfile = dir.path().join("hello.txt");
    let expected = "HELLO_AGENT_BRIDGE\n";

    let (tx, mut rx) = mpsc::unbounded_channel::<AgentEvent>();
    let host = AcpHostHandle::new(tx);

    let cfg = SessionConfig {
        cwd: dir.path().to_path_buf(),
        adapter: AdapterSpec {
            command: FAKE_AGENT.to_string(),
            args: vec![],
            env: vec![
                (
                    "FAKE_AGENT_OUTFILE".to_string(),
                    outfile.to_string_lossy().into_owned(),
                ),
                ("FAKE_AGENT_TEXT".to_string(), expected.to_string()),
            ],
        },
    };

    // Handshake + session.
    let session = timeout(STEP_TIMEOUT, host.start_session(cfg))
        .await
        .expect("start_session timed out")
        .expect("start_session failed");

    // Drive one prompt turn.
    host.send_prompt(&session, "create the file".into())
        .await
        .unwrap();

    let mut streamed = String::new();
    let mut saw_edit = false;
    loop {
        let ev = timeout(STEP_TIMEOUT, rx.recv())
            .await
            .expect("timed out waiting for an event")
            .expect("event channel closed");
        match ev {
            AgentEvent::TextDelta { text, .. } => streamed.push_str(&text),
            AgentEvent::EditHunk {
                request_id,
                path,
                new_text,
                ..
            } => {
                assert_eq!(path, outfile, "edit targets the expected file");
                assert!(new_text.contains("HELLO_AGENT_BRIDGE"));
                saw_edit = true;
                // The accept/reject decision IS the resolution of this request.
                host.resolve_permission(&request_id, Decision::Accept)
                    .await
                    .unwrap();
            }
            AgentEvent::TurnEnded { .. } => break,
            AgentEvent::Error { kind, message, .. } => {
                panic!("unexpected transport error [{kind:?}]: {message}")
            }
            AgentEvent::Thought { .. } => {}
        }
    }

    assert!(saw_edit, "expected an edit hunk");
    assert!(
        streamed.contains("Creating the file"),
        "expected streamed assistant text, got {streamed:?}"
    );

    // The edit actually applied on disk — not merely rendered.
    let written = std::fs::read_to_string(&outfile).expect("output file should exist");
    assert_eq!(written, expected);

    host.shutdown().await.unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn reject_leaves_file_unwritten() {
    let dir = tempfile::tempdir().unwrap();
    let outfile = dir.path().join("nope.txt");

    let (tx, mut rx) = mpsc::unbounded_channel::<AgentEvent>();
    let host = AcpHostHandle::new(tx);

    let cfg = SessionConfig {
        cwd: dir.path().to_path_buf(),
        adapter: AdapterSpec {
            command: FAKE_AGENT.to_string(),
            args: vec![],
            env: vec![
                (
                    "FAKE_AGENT_OUTFILE".to_string(),
                    outfile.to_string_lossy().into_owned(),
                ),
                ("FAKE_AGENT_TEXT".to_string(), "SHOULD_NOT_EXIST".to_string()),
            ],
        },
    };

    let session = timeout(STEP_TIMEOUT, host.start_session(cfg))
        .await
        .expect("start_session timed out")
        .expect("start_session failed");
    host.send_prompt(&session, "create the file".into())
        .await
        .unwrap();

    loop {
        let ev = timeout(STEP_TIMEOUT, rx.recv())
            .await
            .expect("timed out")
            .expect("channel closed");
        match ev {
            AgentEvent::EditHunk { request_id, .. } => {
                host.resolve_permission(&request_id, Decision::Reject)
                    .await
                    .unwrap();
            }
            AgentEvent::TurnEnded { .. } => break,
            AgentEvent::Error { kind, message, .. } => {
                panic!("unexpected error [{kind:?}]: {message}")
            }
            _ => {}
        }
    }

    assert!(!outfile.exists(), "rejected edit must not write the file");
    host.shutdown().await.unwrap();
}
