//! A scripted [`AcpHost`] implementation with no transport at all.
//!
//! This is the 🟢 enabler for building and testing the *entire* UI + IPC surface
//! (Step 1) before any real ACP code exists. It emits a deterministic sequence of
//! [`AgentEvent`]s so the frontend can exercise streaming, the diff hunk, and the
//! accept/reject path against something real-shaped but trivially predictable.

use std::sync::Mutex;

use tokio::sync::mpsc::UnboundedSender;

use crate::contract::{
    AcpHost, AcpHostError, AgentEvent, Decision, PermissionReqId, SessionConfig, SessionId,
    StopReason,
};

/// Fixed session id the fake host hands out.
const FAKE_SESSION: &str = "fake-session";
/// Fixed permission-request id the fake host attaches to its scripted edit.
const FAKE_REQUEST: &str = "fake-request-1";

/// A deterministic, transport-free host for UI/IPC development and tests.
pub struct FakeAcpHost {
    tx: UnboundedSender<AgentEvent>,
    /// Records the last decision the user made, for assertions in tests.
    last_decision: Mutex<Option<Decision>>,
}

impl FakeAcpHost {
    /// Create a fake host that pushes events onto `tx`.
    pub fn new(tx: UnboundedSender<AgentEvent>) -> Self {
        Self {
            tx,
            last_decision: Mutex::new(None),
        }
    }

    /// The decision passed to the most recent [`AcpHost::resolve_permission`], if any.
    pub fn last_decision(&self) -> Option<Decision> {
        *self.last_decision.lock().unwrap()
    }

    fn emit(&self, ev: AgentEvent) -> Result<(), AcpHostError> {
        self.tx
            .send(ev)
            .map_err(|_| AcpHostError::NotRunning("fake event channel closed".into()))
    }
}

#[async_trait::async_trait]
impl AcpHost for FakeAcpHost {
    async fn start_session(&self, _cfg: SessionConfig) -> Result<SessionId, AcpHostError> {
        Ok(SessionId(FAKE_SESSION.into()))
    }

    async fn send_prompt(&self, session: &SessionId, _text: String) -> Result<(), AcpHostError> {
        // Stream a short response, then surface one edit awaiting accept/reject.
        for chunk in ["Sure — ", "creating ", "hello.txt."] {
            self.emit(AgentEvent::TextDelta {
                session: session.clone(),
                text: chunk.into(),
            })?;
        }
        self.emit(AgentEvent::EditHunk {
            session: session.clone(),
            request_id: PermissionReqId(FAKE_REQUEST.into()),
            path: "hello.txt".into(),
            old_text: None,
            new_text: "HELLO_AGENT_BRIDGE\n".into(),
        })?;
        // Note: TurnEnded is intentionally deferred until the user resolves the
        // permission, mirroring the real flow where the turn blocks on approval.
        Ok(())
    }

    async fn resolve_permission(
        &self,
        _request_id: &PermissionReqId,
        decision: Decision,
    ) -> Result<(), AcpHostError> {
        *self.last_decision.lock().unwrap() = Some(decision);
        self.emit(AgentEvent::TurnEnded {
            session: SessionId(FAKE_SESSION.into()),
            stop_reason: StopReason::EndTurn,
        })
    }

    async fn cancel(&self, session: &SessionId) -> Result<(), AcpHostError> {
        self.emit(AgentEvent::TurnEnded {
            session: session.clone(),
            stop_reason: StopReason::Cancelled,
        })
    }

    async fn shutdown(&self) -> Result<(), AcpHostError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn fake_host_drives_full_loop() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let host = FakeAcpHost::new(tx);

        let session = host.start_session(crate::test_support::dummy_config()).await.unwrap();
        host.send_prompt(&session, "hi".into()).await.unwrap();

        // Three text deltas, then an edit hunk.
        let mut text = String::new();
        let req_id;
        loop {
            match rx.recv().await.unwrap() {
                AgentEvent::TextDelta { text: t, .. } => text.push_str(&t),
                AgentEvent::EditHunk {
                    request_id,
                    path,
                    new_text,
                    ..
                } => {
                    assert_eq!(path.to_str(), Some("hello.txt"));
                    assert!(new_text.contains("HELLO_AGENT_BRIDGE"));
                    req_id = request_id;
                    break;
                }
                other => panic!("unexpected event before edit: {other:?}"),
            }
        }
        assert_eq!(text, "Sure — creating hello.txt.");

        host.resolve_permission(&req_id, Decision::Accept).await.unwrap();
        assert_eq!(host.last_decision(), Some(Decision::Accept));

        match rx.recv().await.unwrap() {
            AgentEvent::TurnEnded { stop_reason, .. } => {
                assert_eq!(stop_reason, StopReason::EndTurn);
            }
            other => panic!("expected TurnEnded, got {other:?}"),
        }
    }
}
