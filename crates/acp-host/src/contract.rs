//! The narrow boundary between the 🔴 ACP transport core and the rest of the app.
//!
//! NOTHING outside this crate should ever touch `agent_client_protocol` types.
//! Everything here is plain, owned, `Send` data plus one trait. This is what lets
//! the transport core be frozen behind a contract and what keeps the UI
//! agent-agnostic (the M2 "zero per-agent branches" win, paid forward into M1).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Opaque identifier for an agent session, as minted by the agent.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionId(pub String);

/// Identifier for a pending permission request (one per edit awaiting accept/reject).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PermissionReqId(pub String);

/// The user's decision on a pending edit/permission request.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Decision {
    /// Apply the edit / allow the operation.
    Accept,
    /// Reject the edit / deny the operation.
    Reject,
}

/// How to launch an agent adapter. The *only* thing that varies between agents
/// (Claude in M1, Codex in M2): a command, its args, and env. No rendering code
/// branches on which agent this is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdapterSpec {
    /// Executable to spawn (e.g. `npx`).
    pub command: String,
    /// Arguments (e.g. `["-y", "@zed-industries/claude-code-acp@latest"]`).
    pub args: Vec<String>,
    /// Extra environment variables (e.g. `ANTHROPIC_API_KEY`). Inherited env still applies.
    pub env: Vec<(String, String)>,
}

/// Everything needed to start one session with one agent.
#[derive(Debug, Clone)]
pub struct SessionConfig {
    /// Working directory the agent operates in.
    pub cwd: PathBuf,
    /// Which adapter to spawn.
    pub adapter: AdapterSpec,
}

/// Why a prompt turn ended. Mirrors ACP's `StopReason` without leaking its type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StopReason {
    /// The agent finished its turn normally.
    EndTurn,
    /// The agent hit a token limit.
    MaxTokens,
    /// The agent hit a turn-request limit.
    MaxTurnRequests,
    /// The agent refused.
    Refusal,
    /// The turn was cancelled (by us or the agent).
    Cancelled,
    /// Any other / future stop reason, carried as a string.
    Other(String),
}

/// Coarse classification of a transport/host error, so the UI can react
/// appropriately (and so tests can assert on the *kind*, not the message text).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    /// The adapter process could not be spawned.
    Spawn,
    /// Authentication is required / missing (e.g. no API key).
    Auth,
    /// A timeout fired (startup or idle).
    Timeout,
    /// A malformed/undeserializable frame arrived; the session was torn down.
    MalformedFrame,
    /// The adapter subprocess exited unexpectedly.
    ProcessDied,
    /// A protocol-level error from the agent.
    Protocol,
    /// Anything else.
    Other,
}

/// The ONE message model the UI renders, for every agent. ACP types are
/// translated into this at the boundary (see `translate` in the host), so the
/// frontend never imports ACP and never branches per agent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AgentEvent {
    /// A chunk of streamed assistant text.
    TextDelta {
        /// Session this delta belongs to.
        session: SessionId,
        /// The text chunk.
        text: String,
    },
    /// A chunk of streamed agent "thinking" (rendered distinctly, optional for M1).
    Thought {
        /// Session this belongs to.
        session: SessionId,
        /// The thought chunk.
        text: String,
    },
    /// A file edit awaiting accept/reject. The single diff hunk of M1.
    EditHunk {
        /// Session this edit belongs to.
        session: SessionId,
        /// Resolve this id via [`AcpHost::resolve_permission`].
        request_id: PermissionReqId,
        /// File being modified.
        path: PathBuf,
        /// Original content (`None` for a new file).
        old_text: Option<String>,
        /// New content after the edit.
        new_text: String,
    },
    /// The current prompt turn ended.
    TurnEnded {
        /// Session whose turn ended.
        session: SessionId,
        /// Why it ended.
        stop_reason: StopReason,
    },
    /// A transport/host error surfaced to the UI.
    Error {
        /// Session this error pertains to, if known.
        session: Option<SessionId>,
        /// Coarse error classification.
        kind: ErrorKind,
        /// Human-readable detail.
        message: String,
    },
}

/// Errors returned by [`AcpHost`] method calls (as opposed to streamed
/// [`AgentEvent::Error`]s, which report problems that arise mid-stream).
#[derive(Debug, thiserror::Error)]
pub enum AcpHostError {
    /// The adapter process could not be spawned or the handshake failed.
    #[error("failed to start adapter: {0}")]
    Spawn(String),
    /// Authentication is required / missing.
    #[error("authentication required: {0}")]
    Auth(String),
    /// A timeout fired before the operation completed.
    #[error("timed out: {0}")]
    Timeout(String),
    /// The session id is unknown (never started, or already shut down).
    #[error("unknown session: {0:?}")]
    UnknownSession(SessionId),
    /// The permission request id is unknown (already resolved, or never issued).
    #[error("unknown permission request: {0:?}")]
    UnknownPermission(PermissionReqId),
    /// The host's background task is gone (subprocess died, or shutdown).
    #[error("host is not running: {0}")]
    NotRunning(String),
    /// A protocol-level error.
    #[error("protocol error: {0}")]
    Protocol(String),
}

/// What the rest of the app can ask the ACP host to do.
///
/// Streamed output (text deltas, edit hunks, turn-ended, errors) is delivered
/// out-of-band via the [`AgentEvent`] channel handed to the host at construction
/// — NEVER through these return values. This is what keeps the transport core's
/// internals isolated behind `Send` channels.
#[async_trait::async_trait]
pub trait AcpHost: Send + Sync {
    /// Spawn the adapter, run the ACP handshake, and open one session.
    async fn start_session(&self, cfg: SessionConfig) -> Result<SessionId, AcpHostError>;

    /// Send a user prompt. Output arrives on the event channel.
    async fn send_prompt(&self, session: &SessionId, text: String) -> Result<(), AcpHostError>;

    /// Resolve a pending edit/permission request the user accepted or rejected.
    async fn resolve_permission(
        &self,
        request_id: &PermissionReqId,
        decision: Decision,
    ) -> Result<(), AcpHostError>;

    /// Cancel the in-flight turn for a session, if any.
    async fn cancel(&self, session: &SessionId) -> Result<(), AcpHostError>;

    /// Shut the host down: cancel work and kill the adapter subprocess.
    async fn shutdown(&self) -> Result<(), AcpHostError>;
}
