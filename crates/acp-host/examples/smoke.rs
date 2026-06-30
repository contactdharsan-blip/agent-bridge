//! Live smoke driver (plan §6b): spawn an adapter, send one canned prompt, and
//! assert a sane response shape. Exits non-zero on failure. Driven by
//! `tests-e2e/smoke.sh`; run after any 🔴 change to catch transport regressions.
//!
//! Usage: `cargo run -p acp-host --example smoke -- [claude|codex]`

use std::process::exit;
use std::time::Duration;

use acp_host::{adapter_for, AcpHost, AcpHostHandle, AgentEvent, Decision, SessionConfig};
use tokio::sync::mpsc;
use tokio::time::timeout;

#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn main() {
    let agent_id = std::env::args().nth(1).unwrap_or_else(|| "claude".into());

    let adapter = match adapter_for(&agent_id) {
        Some(a) => a,
        None => {
            eprintln!("unknown agent id: {agent_id}");
            exit(2);
        }
    };

    let dir = match tempfile::tempdir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("tempdir failed: {e}");
            exit(1);
        }
    };

    let (tx, mut rx) = mpsc::unbounded_channel::<AgentEvent>();
    let host = AcpHostHandle::new(tx);

    let cfg = SessionConfig {
        cwd: dir.path().to_path_buf(),
        adapter,
    };

    eprintln!("[smoke] starting session with {agent_id}…");
    let session = match timeout(Duration::from_secs(90), host.start_session(cfg)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            eprintln!("[smoke] start_session failed: {e}");
            exit(1);
        }
        Err(_) => {
            eprintln!("[smoke] start_session timed out");
            exit(1);
        }
    };

    if let Err(e) = host
        .send_prompt(&session, "Say the single word: ready.".into())
        .await
    {
        eprintln!("[smoke] send_prompt failed: {e}");
        exit(1);
    }

    let mut got_text = false;
    let drive = async {
        loop {
            match rx.recv().await {
                Some(AgentEvent::TextDelta { text, .. }) => {
                    got_text = true;
                    eprint!("{text}");
                }
                Some(AgentEvent::EditHunk { request_id, .. }) => {
                    // Auto-accept so a turn that edits doesn't stall the smoke run.
                    let _ = host.resolve_permission(&request_id, Decision::Accept).await;
                }
                Some(AgentEvent::TurnEnded { stop_reason, .. }) => {
                    eprintln!("\n[smoke] turn ended: {stop_reason:?}");
                    break true;
                }
                Some(AgentEvent::Error { kind, message, .. }) => {
                    eprintln!("\n[smoke] transport error [{kind:?}]: {message}");
                    break false;
                }
                Some(AgentEvent::Thought { .. }) => {}
                None => break false,
            }
        }
    };

    let ok = match timeout(Duration::from_secs(120), drive).await {
        Ok(ended_ok) => ended_ok && got_text,
        Err(_) => {
            eprintln!("[smoke] turn timed out");
            false
        }
    };

    let _ = host.shutdown().await;

    if ok {
        eprintln!("[smoke] OK");
        exit(0);
    } else {
        eprintln!("[smoke] FAILED");
        exit(1);
    }
}
