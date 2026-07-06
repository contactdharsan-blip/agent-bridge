//! A minimal fake ACP **agent** used only by tests.
//!
//! It speaks real ACP over stdio so the offline transport test can exercise the
//! real [`acp_host::AcpHostHandle`] end-to-end — spawn, handshake, session,
//! prompt, streamed text, an edit gated by a permission request, and a stop
//! reason — with no API key and no network. It also reacts to `session/cancel`
//! by racing it against the pending permission decision, so a test can prove
//! cancellation actually reaches (and is honored by) the subprocess.
//!
//! Behaviour is controlled by env vars set by the test:
//! - `FAKE_AGENT_OUTFILE` — absolute path the "edit" writes to (on accept).
//! - `FAKE_AGENT_TEXT` — the file's contents / the diff's new text.
//! - `FAKE_AGENT_NONDIFF_PERMISSION` — if set, the permission ask carries no
//!   diff content (a title + kind only, like a shell-command approval), to
//!   exercise the non-EditHunk `PermissionRequest` path (UI-FR06).
//! - `FAKE_AGENT_DEBUG_LOG` — optional path to append lifecycle trace lines to
//!   (the subprocess's stderr is piped and consumed internally by the SDK, so
//!   it never reaches the test's terminal — this is the only way to observe
//!   what it did when a test hangs).

use std::sync::Arc;

use agent_client_protocol::schema::v1::{
    AgentCapabilities, CancelNotification, ContentBlock, ContentChunk, Diff, InitializeRequest,
    InitializeResponse, NewSessionRequest, NewSessionResponse, PermissionOption,
    PermissionOptionKind, PromptRequest, PromptResponse, RequestPermissionOutcome,
    RequestPermissionRequest, SessionNotification, SessionUpdate, StopReason, TextContent,
    ToolCallContent, ToolCallUpdate, ToolCallUpdateFields, ToolKind,
};
use agent_client_protocol::{Agent, Client, ConnectionTo, Responder, Result, Stdio};
use tokio::sync::Notify;

const SESSION_ID: &str = "fake-session-1";
const ALLOW_ID: &str = "allow";

/// Debug-only file logger (stderr is piped/consumed internally by the SDK and
/// never reaches the test's terminal, so a file is the only way to observe
/// what this subprocess actually did while debugging).
fn dbg_log(path: &Option<String>, msg: &str) {
    if let Some(path) = path {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{msg}");
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let outfile = std::env::var("FAKE_AGENT_OUTFILE").unwrap_or_else(|_| "hello.txt".into());
    let text = std::env::var("FAKE_AGENT_TEXT").unwrap_or_else(|_| "HELLO_AGENT_BRIDGE\n".into());
    let debug_log = std::env::var("FAKE_AGENT_DEBUG_LOG").ok();
    dbg_log(&debug_log, "fake_agent starting");
    // Set by the cancellation test only; every other test never triggers it, so
    // the accept/reject flow below is unaffected — the two branches just race.
    let cancelled = Arc::new(Notify::new());

    Agent
        .builder()
        .name("fake-agent")
        .on_receive_request(
            async move |req: InitializeRequest, responder, _cx| {
                responder.respond(
                    InitializeResponse::new(req.protocol_version)
                        .agent_capabilities(AgentCapabilities::new()),
                )
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |_req: NewSessionRequest, responder, _cx| {
                responder.respond(NewSessionResponse::new(SESSION_ID))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_notification({
            let cancelled = cancelled.clone();
            let debug_log = debug_log.clone();
            async move |_n: CancelNotification, _cx| {
                dbg_log(&debug_log, "received session/cancel");
                cancelled.notify_one();
                Ok(())
            }
        }, agent_client_protocol::on_receive_notification!())
        .on_receive_request(
            async move |_req: PromptRequest,
                        responder: Responder<PromptResponse>,
                        cx: ConnectionTo<Client>| {
                // 1. Stream a little assistant text.
                cx.send_notification(SessionNotification::new(
                    SESSION_ID,
                    SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::Text(
                        TextContent::new("Creating the file."),
                    ))),
                ))?;

                // 2. Request permission — a file diff, or (for the UI-FR06
                //    regression test) a non-diff ask like a shell-command
                //    approval, carrying only a title/kind and no content.
                let tool_call = if std::env::var("FAKE_AGENT_NONDIFF_PERMISSION").is_ok() {
                    ToolCallUpdate::new(
                        "exec-1",
                        ToolCallUpdateFields::new()
                            .title("Run `echo hi`")
                            .kind(ToolKind::Execute),
                    )
                } else {
                    ToolCallUpdate::new(
                        "edit-1",
                        ToolCallUpdateFields::new().content(vec![ToolCallContent::Diff(Diff::new(
                            outfile.clone(),
                            text.clone(),
                        ))]),
                    )
                };
                let options = vec![
                    PermissionOption::new(ALLOW_ID, "Allow", PermissionOptionKind::AllowOnce),
                    PermissionOption::new("reject", "Reject", PermissionOptionKind::RejectOnce),
                ];

                let outfile = outfile.clone();
                let text = text.clone();
                let conn = cx.clone();
                let cancelled = cancelled.clone();
                let debug_log = debug_log.clone();
                // 3. Drive the request from a spawned task (block_task is fine here,
                //    just not directly inside the handler). Race the client's
                //    permission decision against a `session/cancel` notification —
                //    whichever arrives first decides how the turn ends. Real
                //    agents are not obligated to react to cancellation this fast;
                //    this is what a *cooperative* one that does looks like.
                cx.spawn(async move {
                    dbg_log(&debug_log, "prompt handler: awaiting permission or cancel");
                    let perm = conn
                        .send_request(RequestPermissionRequest::new(SESSION_ID, tool_call, options))
                        .block_task();
                    tokio::select! {
                        response = perm => {
                            dbg_log(&debug_log, "permission branch won");
                            let response = response?;
                            let accepted = matches!(
                                &response.outcome,
                                RequestPermissionOutcome::Selected(sel) if &*sel.option_id.0 == ALLOW_ID
                            );
                            if accepted {
                                std::fs::write(&outfile, &text)
                                    .map_err(agent_client_protocol::util::internal_error)?;
                            }
                            responder.respond(PromptResponse::new(StopReason::EndTurn))?;
                        }
                        _ = cancelled.notified() => {
                            dbg_log(&debug_log, "cancel branch won; responding Cancelled");
                            let r = responder.respond(PromptResponse::new(StopReason::Cancelled));
                            dbg_log(&debug_log, &format!("respond result ok={:?}", r.is_ok()));
                            r?;
                        }
                    }
                    Ok(())
                })
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_to(Stdio::new())
        .await
}
