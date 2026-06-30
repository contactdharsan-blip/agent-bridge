//! 🔴 failure-mode tests (plan §6b "places to slow down"): a hung or dead adapter
//! must surface an error promptly, never hang the caller. These run offline with
//! no real adapter — they use trivial commands that fail to speak ACP.

use std::time::Duration;

use acp_host::{AcpHost, AcpHostHandle, AdapterSpec, AgentEvent, SessionConfig};
use tokio::sync::mpsc;
use tokio::time::timeout;

/// Each call must resolve well within this bound (the startup timeout is 60s, but
/// these failures are detected immediately via process exit / spawn error).
const BOUND: Duration = Duration::from_secs(20);

fn config(command: &str, args: &[&str]) -> SessionConfig {
    SessionConfig {
        cwd: std::env::temp_dir(),
        adapter: AdapterSpec {
            command: command.to_string(),
            args: args.iter().map(|s| s.to_string()).collect(),
            env: vec![],
        },
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn nonexistent_command_fails_fast() {
    let (tx, _rx) = mpsc::unbounded_channel::<AgentEvent>();
    let host = AcpHostHandle::new(tx);

    let result = timeout(
        BOUND,
        host.start_session(config("definitely-not-a-real-binary-xyz", &[])),
    )
    .await
    .expect("start_session must not hang on a missing binary");

    assert!(result.is_err(), "spawning a missing binary should error");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn adapter_that_exits_with_error_fails_fast() {
    let (tx, _rx) = mpsc::unbounded_channel::<AgentEvent>();
    let host = AcpHostHandle::new(tx);

    // `false` exits non-zero immediately — the shape of a real adapter that
    // fails to authenticate and bails before the handshake completes.
    let result = timeout(BOUND, host.start_session(config("false", &[])))
        .await
        .expect("start_session must not hang when the adapter exits with an error");

    assert!(
        result.is_err(),
        "an adapter that exits before the handshake should error"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shutdown_without_session_is_ok() {
    let (tx, _rx) = mpsc::unbounded_channel::<AgentEvent>();
    let host = AcpHostHandle::new(tx);
    // Shutting down a host that never started a session must be a clean no-op.
    host.shutdown().await.unwrap();
}
