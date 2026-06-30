//! THE M1/M2 GATE — real round-trips against the real adapters.
//!
//! Each test spawns an actual adapter (via the registry), sends an edit-forcing
//! prompt, and asserts the full vertical slice: streamed text → an edit hunk →
//! accept → the file actually written to disk → turn end. When the Claude test is
//! green, the `acp-host` public API is frozen (plan §6b). The Codex test is the
//! M2 parity check — the SAME host code, only a different registry entry.
//!
//! Both are **skip-guarded**: with no API key (and no Node/network to fetch the
//! adapter) they print a clear skip message and return — a skip, never a false
//! pass. Run explicitly with, e.g.:
//!   ANTHROPIC_API_KEY=sk-... cargo test -p acp-host --test round_trip -- --ignored --nocapture

use std::time::Duration;

use acp_host::{adapter_for, AcpHost, AcpHostHandle, AgentEvent, Decision, SessionConfig};
use tokio::sync::mpsc;
use tokio::time::timeout;

/// Generous bound on the whole turn so a hung adapter fails loudly, not forever.
const TURN_TIMEOUT: Duration = Duration::from_secs(120);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires ANTHROPIC_API_KEY + Node>=22 + network; run explicitly"]
async fn claude_real_round_trip() {
    real_round_trip("claude", "ANTHROPIC_API_KEY").await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires OPENAI_API_KEY + Node>=22 + network; run explicitly"]
async fn codex_real_round_trip() {
    real_round_trip("codex", "OPENAI_API_KEY").await;
}

/// Drive one real prompt→response→edit→accept→file round-trip for `agent_id`.
/// Skips (does not fail) when `key_env` is absent.
async fn real_round_trip(agent_id: &str, key_env: &str) {
    if std::env::var(key_env).is_err() {
        eprintln!(
            "SKIP {agent_id} round-trip: {key_env} not set. \
             Export a key to run the real-adapter gate test."
        );
        return;
    }

    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("hello.txt");

    let (tx, mut rx) = mpsc::unbounded_channel::<AgentEvent>();
    let host = AcpHostHandle::new(tx);

    let cfg = SessionConfig {
        cwd: dir.path().to_path_buf(),
        adapter: adapter_for(agent_id).expect("agent is registered"),
    };

    let session = timeout(TURN_TIMEOUT, host.start_session(cfg))
        .await
        .expect("start_session timed out")
        .expect("start_session failed (auth? node? network?)");

    host.send_prompt(
        &session,
        "Create a file named hello.txt containing exactly the text: \
         HELLO_AGENT_BRIDGE. Then stop."
            .into(),
    )
    .await
    .unwrap();

    let mut saw_text = false;
    let mut saw_edit = false;

    let drive = async {
        loop {
            match rx.recv().await.expect("event channel closed") {
                AgentEvent::TextDelta { .. } => saw_text = true,
                AgentEvent::EditHunk {
                    request_id,
                    new_text,
                    ..
                } => {
                    saw_edit = true;
                    assert!(
                        new_text.contains("HELLO_AGENT_BRIDGE"),
                        "edit should contain the requested text"
                    );
                    host.resolve_permission(&request_id, Decision::Accept)
                        .await
                        .unwrap();
                }
                AgentEvent::TurnEnded { .. } => break,
                AgentEvent::Error { kind, message, .. } => {
                    panic!("transport error [{kind:?}]: {message}")
                }
                AgentEvent::Thought { .. } => {}
            }
        }
    };
    timeout(TURN_TIMEOUT, drive)
        .await
        .expect("turn did not complete within the timeout");

    assert!(saw_text, "expected streamed assistant text");
    assert!(saw_edit, "expected an edit hunk for hello.txt");

    let written = std::fs::read_to_string(&target).expect("hello.txt should exist on disk");
    assert!(
        written.contains("HELLO_AGENT_BRIDGE"),
        "file content should match the prompt, got {written:?}"
    );

    host.shutdown().await.unwrap();
}
