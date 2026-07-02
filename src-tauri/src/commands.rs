//! Tauri IPC surface (Rust ⇄ React). Thin glue over the frozen `acp-host`
//! contract: it bridges the host's `AgentEvent` channel to a Tauri `Channel`,
//! and forwards user actions to the host. No agent-specific logic lives here —
//! the agent is selected purely by `agent_id` against the registry.

use std::path::PathBuf;
use std::sync::Arc;

use acp_host::{
    adapter_for, known_agents, AcpHost, AcpHostError, AcpHostHandle, AgentEvent, AgentInfo,
    Decision, PermissionReqId, SessionConfig, SessionId,
};
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::Mutex;

/// App-wide state: the one live host (M1/M2 run a single session at a time).
#[derive(Default)]
pub struct AppState {
    host: Mutex<Option<Arc<AcpHostHandle>>>,
}

/// List the agents the core can launch, with live auth-presence hints.
#[tauri::command]
pub fn list_agents() -> Vec<AgentInfo> {
    known_agents()
}

/// Turn a host start-session failure into a frontend-recognizable message.
/// Auth-ness is derived from the real error (the typed `Auth` variant if it is
/// ever reachable, else conservative markers in the adapter's own failure text)
/// — never invented. On a likely auth failure we prefix `AUTH_REQUIRED:` so the
/// UI can say "sign in to <agent>" while preserving the raw detail after it.
fn classify_start_error(e: AcpHostError, agent_id: &str) -> String {
    let looks_like_auth = matches!(e, AcpHostError::Auth(_)) || {
        let m = e.to_string().to_lowercase();
        m.contains("unauthor")
            || m.contains("not logged in")
            || m.contains("authentication")
            || m.contains("login")
            || m.contains("401")
            || m.contains("api key")
    };
    if looks_like_auth {
        format!("AUTH_REQUIRED:{agent_id}:{e}")
    } else {
        e.to_string()
    }
}

/// Spawn the chosen agent's adapter and open one session. Streamed events are
/// pumped onto `on_event` (a JS-side `Channel`).
#[tauri::command]
pub async fn start_session(
    state: State<'_, AppState>,
    agent_id: String,
    cwd: String,
    on_event: Channel<AgentEvent>,
) -> Result<SessionId, String> {
    let adapter = adapter_for(&agent_id).ok_or_else(|| format!("unknown agent: {agent_id}"))?;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<AgentEvent>();
    let host = Arc::new(AcpHostHandle::new(tx));

    // Pump host events → the frontend channel for the session's lifetime.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if on_event.send(event).is_err() {
                break; // frontend went away
            }
        }
    });

    let session = host
        .start_session(SessionConfig {
            cwd: PathBuf::from(cwd),
            adapter,
        })
        .await
        .map_err(|e| classify_start_error(e, &agent_id))?;

    *state.host.lock().await = Some(host);
    Ok(session)
}

/// Send a user prompt to the active session.
#[tauri::command]
pub async fn send_prompt(
    state: State<'_, AppState>,
    session: SessionId,
    text: String,
) -> Result<(), String> {
    let host = current(&state).await?;
    host.send_prompt(&session, text).await.map_err(|e| e.to_string())
}

/// Resolve a pending edit/permission request (the accept/reject diff action).
#[tauri::command]
pub async fn resolve_permission(
    state: State<'_, AppState>,
    request_id: String,
    decision: Decision,
) -> Result<(), String> {
    let host = current(&state).await?;
    host.resolve_permission(&PermissionReqId(request_id), decision)
        .await
        .map_err(|e| e.to_string())
}

/// Cancel the in-flight turn for a session.
#[tauri::command]
pub async fn cancel(state: State<'_, AppState>, session: SessionId) -> Result<(), String> {
    let host = current(&state).await?;
    host.cancel(&session).await.map_err(|e| e.to_string())
}

/// Fetch the current host or report that no session is active.
async fn current(state: &State<'_, AppState>) -> Result<Arc<AcpHostHandle>, String> {
    state
        .host
        .lock()
        .await
        .clone()
        .ok_or_else(|| "no active session".to_string())
}
