//! The real [`AcpHost`] — 🔴 transport core.
//!
//! Process spawning, stdio framing, and JSON-RPC are all handled by the
//! `agent-client-protocol` crate (via [`AcpAgent`] + the `Client` builder); this
//! module is the thin layer that:
//!   1. runs the handshake + opens one session,
//!   2. drives prompt turns from a command channel,
//!   3. translates streamed updates into [`AgentEvent`]s (via the pure
//!      [`crate::translate`] functions), and
//!   4. gates edits on a user accept/reject decision.
//!
//! Everything `agent_client_protocol`-shaped stays inside this file. The outside
//! world sees only the [`AcpHost`] trait and plain contract types.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use agent_client_protocol::schema::v1::{
    InitializeRequest, RequestPermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse, SelectedPermissionOutcome, SessionNotification,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{AcpAgent, Agent, Client, ConnectionTo, Responder, SessionMessage};
use tokio::sync::{mpsc, oneshot, Mutex as TokioMutex};
use tokio::task::JoinHandle;

use crate::contract::{
    AcpHost, AcpHostError, AdapterSpec, AgentEvent, Decision, ErrorKind, PermissionReqId,
    SessionConfig, SessionId,
};
use crate::translate;

/// How long to wait for the adapter to spawn + handshake + open a session.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

/// Map of in-flight permission requests → the channel that delivers the user's decision.
type Pending = Arc<StdMutex<HashMap<PermissionReqId, oneshot::Sender<Decision>>>>;

/// Commands the handle sends into the connection task.
enum HostCommand {
    SendPrompt(String),
    Cancel,
    Shutdown,
}

struct RunningSession {
    session_id: SessionId,
    cmd_tx: mpsc::UnboundedSender<HostCommand>,
    task: JoinHandle<()>,
}

/// The real host. Construct with [`AcpHostHandle::new`], passing the channel that
/// streamed [`AgentEvent`]s should be delivered on.
pub struct AcpHostHandle {
    events: mpsc::UnboundedSender<AgentEvent>,
    inner: TokioMutex<Option<RunningSession>>,
    pending: Pending,
}

impl AcpHostHandle {
    /// Create a host that pushes streamed events onto `events`.
    pub fn new(events: mpsc::UnboundedSender<AgentEvent>) -> Self {
        Self {
            events,
            inner: TokioMutex::new(None),
            pending: Arc::new(StdMutex::new(HashMap::new())),
        }
    }
}

/// Build an [`AcpAgent`] transport from an [`AdapterSpec`].
///
/// Env vars are passed as leading `NAME=value` arguments, which `AcpAgent`
/// parses into the spawned process's environment (on top of the inherited env).
fn build_agent(spec: &AdapterSpec) -> Result<AcpAgent, AcpHostError> {
    let mut args: Vec<String> = Vec::with_capacity(spec.env.len() + 1 + spec.args.len());
    for (name, value) in &spec.env {
        args.push(format!("{name}={value}"));
    }
    args.push(spec.command.clone());
    args.extend(spec.args.iter().cloned());
    let agent = AcpAgent::from_args(args).map_err(|e| AcpHostError::Spawn(e.to_string()))?;
    // Frame logging (plan §6b "log every inbound frame"): opt-in via env so the
    // wire traffic can be inspected when diagnosing transport issues.
    if std::env::var("AGENT_BRIDGE_DEBUG_FRAMES").is_ok() {
        Ok(agent.with_debug(|line, direction| {
            eprintln!("[acp {direction:?}] {line}");
        }))
    } else {
        Ok(agent)
    }
}

#[async_trait::async_trait]
impl AcpHost for AcpHostHandle {
    async fn start_session(&self, cfg: SessionConfig) -> Result<SessionId, AcpHostError> {
        let agent = build_agent(&cfg.adapter)?;
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        let (started_tx, started_rx) = oneshot::channel::<Result<SessionId, String>>();

        let events = self.events.clone();
        let pending = self.pending.clone();
        let cwd = cfg.cwd.clone();

        let task = tokio::spawn(run_connection(
            agent, cwd, cmd_rx, events, pending, started_tx,
        ));

        let sid = match tokio::time::timeout(STARTUP_TIMEOUT, started_rx).await {
            Ok(Ok(Ok(sid))) => sid,
            Ok(Ok(Err(msg))) => return Err(AcpHostError::Spawn(msg)),
            Ok(Err(_canceled)) => {
                return Err(AcpHostError::Spawn(
                    "connection task ended before the session started".into(),
                ))
            }
            Err(_elapsed) => {
                task.abort();
                return Err(AcpHostError::Timeout(
                    "adapter did not start within the startup timeout".into(),
                ));
            }
        };

        *self.inner.lock().await = Some(RunningSession {
            session_id: sid.clone(),
            cmd_tx,
            task,
        });
        Ok(sid)
    }

    async fn send_prompt(&self, session: &SessionId, text: String) -> Result<(), AcpHostError> {
        let guard = self.inner.lock().await;
        let running = guard
            .as_ref()
            .ok_or_else(|| AcpHostError::NotRunning("no active session".into()))?;
        if &running.session_id != session {
            return Err(AcpHostError::UnknownSession(session.clone()));
        }
        running
            .cmd_tx
            .send(HostCommand::SendPrompt(text))
            .map_err(|_| AcpHostError::NotRunning("connection task is gone".into()))
    }

    async fn resolve_permission(
        &self,
        request_id: &PermissionReqId,
        decision: Decision,
    ) -> Result<(), AcpHostError> {
        let tx = self.pending.lock().unwrap().remove(request_id);
        match tx {
            Some(tx) => {
                // If the receiver is gone the request was already resolved/cancelled; ignore.
                let _ = tx.send(decision);
                Ok(())
            }
            None => Err(AcpHostError::UnknownPermission(request_id.clone())),
        }
    }

    async fn cancel(&self, session: &SessionId) -> Result<(), AcpHostError> {
        let guard = self.inner.lock().await;
        let running = guard
            .as_ref()
            .ok_or_else(|| AcpHostError::NotRunning("no active session".into()))?;
        if &running.session_id != session {
            return Err(AcpHostError::UnknownSession(session.clone()));
        }
        running
            .cmd_tx
            .send(HostCommand::Cancel)
            .map_err(|_| AcpHostError::NotRunning("connection task is gone".into()))
    }

    async fn shutdown(&self) -> Result<(), AcpHostError> {
        if let Some(running) = self.inner.lock().await.take() {
            let _ = running.cmd_tx.send(HostCommand::Shutdown);
            // Aborting drops the connection future, which drops the AcpAgent
            // transport, whose ChildGuard kills the subprocess.
            running.task.abort();
        }
        // Wake any still-pending permission waiters so their handlers unblock.
        self.pending.lock().unwrap().clear();
        Ok(())
    }
}

/// Owns the live ACP connection for one session and drives it until shutdown.
///
/// Runs inside a `tokio::spawn`. The whole stack is runtime-agnostic `Send`
/// futures (the transport is `futures`/`async-process` based), so no dedicated
/// `LocalSet` thread is required.
async fn run_connection(
    agent: AcpAgent,
    cwd: PathBuf,
    cmd_rx: mpsc::UnboundedReceiver<HostCommand>,
    events: mpsc::UnboundedSender<AgentEvent>,
    pending: Pending,
    started_tx: oneshot::Sender<Result<SessionId, String>>,
) {
    // Cloned captures for the permission-request handler (called once per edit)
    // and the connection closure; the original `events` stays for final error reporting.
    let events_perm = events.clone();
    let pending_perm = pending.clone();
    let events_conn = events.clone();

    let result = Client
        .builder()
        .name("agent-bridge")
        .on_receive_request(
            async move |req: RequestPermissionRequest,
                        responder: Responder<RequestPermissionResponse>,
                        _cx| {
                handle_permission(req, responder, events_perm.clone(), pending_perm.clone()).await
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, move |cx: ConnectionTo<Agent>| async move {
            // --- Handshake + open one session ---
            let setup = async {
                cx.send_request(InitializeRequest::new(ProtocolVersion::V1))
                    .block_task()
                    .await?;
                let session = cx.build_session(&cwd).block_task().start_session().await?;
                Ok::<_, agent_client_protocol::Error>(session)
            };
            let mut session = match setup.await {
                Ok(s) => s,
                Err(e) => {
                    let _ = started_tx.send(Err(e.to_string()));
                    return Err(e);
                }
            };

            let sid = SessionId(session.session_id().0.to_string());
            let _ = started_tx.send(Ok(sid.clone()));

            // --- Command loop: one prompt turn at a time ---
            let mut cmd_rx = cmd_rx;
            while let Some(cmd) = cmd_rx.recv().await {
                match cmd {
                    HostCommand::SendPrompt(text) => {
                        if let Err(e) = run_turn(&mut session, &sid, text, &events_conn).await {
                            let _ = events_conn.send(AgentEvent::Error {
                                session: Some(sid.clone()),
                                kind: ErrorKind::Protocol,
                                message: e.to_string(),
                            });
                        }
                    }
                    // Cancellation is plumbed end-to-end but its agent-facing
                    // notification is implemented in the Step 5 hardening pass.
                    HostCommand::Cancel => {}
                    HostCommand::Shutdown => break,
                }
            }
            Ok(())
        })
        .await;

    if let Err(e) = result {
        // The connection ended with an error (process death, protocol fault, …).
        let _ = events.send(AgentEvent::Error {
            session: None,
            kind: ErrorKind::ProcessDied,
            message: e.to_string(),
        });
    }
}

/// Drive a single prompt turn: send the prompt, stream updates, end on stop.
async fn run_turn(
    session: &mut agent_client_protocol::ActiveSession<'static, agent_client_protocol::Agent>,
    sid: &SessionId,
    text: String,
    events: &mpsc::UnboundedSender<AgentEvent>,
) -> Result<(), agent_client_protocol::Error> {
    session.send_prompt(text)?;
    loop {
        match session.read_update().await? {
            SessionMessage::SessionMessage(dispatch) => {
                let sid = sid.clone();
                let events = events.clone();
                MatchDispatch::new(dispatch)
                    .if_notification(async move |notif: SessionNotification| {
                        if let Some(ev) = translate::session_update_to_event(&sid, &notif.update) {
                            let _ = events.send(ev);
                        }
                        Ok::<(), agent_client_protocol::Error>(())
                    })
                    .await
                    .otherwise_ignore()?;
            }
            SessionMessage::StopReason(stop) => {
                let _ = events.send(AgentEvent::TurnEnded {
                    session: sid.clone(),
                    stop_reason: translate::stop_reason(&stop),
                });
                break;
            }
            // `SessionMessage` is `#[non_exhaustive]`; ignore future variants.
            _ => {}
        }
    }
    Ok(())
}

/// Handle one `session/request_permission`: surface the edit, await the user's
/// decision, then select the matching ACP option (or cancel).
async fn handle_permission(
    req: RequestPermissionRequest,
    responder: Responder<RequestPermissionResponse>,
    events: mpsc::UnboundedSender<AgentEvent>,
    pending: Pending,
) -> Result<(), agent_client_protocol::Error> {
    let sid = SessionId(req.session_id.0.to_string());
    let req_id = translate::permission_req_id(&req.tool_call);

    // Surface the diff hunk (if this permission is an edit) so the UI can render
    // accept/reject. Non-edit permissions still get a decision channel below.
    if let Some(ev) = translate::edit_from_permission(&sid, &req.tool_call) {
        let _ = events.send(ev);
    }

    let (tx, rx) = oneshot::channel::<Decision>();
    pending.lock().unwrap().insert(req_id.clone(), tx);

    // Block this request on the user's choice. The agent is awaiting our reply,
    // so blocking the dispatch loop here is correct: nothing else can progress
    // until the edit is resolved.
    let decision = rx.await.unwrap_or(Decision::Reject);
    pending.lock().unwrap().remove(&req_id);

    let outcome = match translate::select_option(decision, &req.options) {
        Some(option_id) => {
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(option_id))
        }
        None => RequestPermissionOutcome::Cancelled,
    };
    responder.respond(RequestPermissionResponse::new(outcome))
}
