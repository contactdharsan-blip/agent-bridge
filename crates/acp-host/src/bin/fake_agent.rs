//! A minimal fake ACP **agent** used only by tests.
//!
//! It speaks real ACP over stdio so the offline transport test can exercise the
//! real [`acp_host::AcpHostHandle`] end-to-end — spawn, handshake, session,
//! prompt, streamed text, an edit gated by a permission request, and a stop
//! reason — with no API key and no network.
//!
//! Behaviour is controlled by env vars set by the test:
//! - `FAKE_AGENT_OUTFILE` — absolute path the "edit" writes to (on accept).
//! - `FAKE_AGENT_TEXT` — the file's contents / the diff's new text.

use agent_client_protocol::schema::v1::{
    AgentCapabilities, ContentBlock, ContentChunk, Diff, InitializeRequest, InitializeResponse,
    NewSessionRequest, NewSessionResponse, PermissionOption, PermissionOptionKind, PromptRequest,
    PromptResponse, RequestPermissionOutcome, RequestPermissionRequest, SessionNotification,
    SessionUpdate, StopReason, TextContent, ToolCallContent, ToolCallUpdate, ToolCallUpdateFields,
};
use agent_client_protocol::{Agent, Client, ConnectionTo, Responder, Result, Stdio};

const SESSION_ID: &str = "fake-session-1";
const ALLOW_ID: &str = "allow";

#[tokio::main]
async fn main() -> Result<()> {
    let outfile = std::env::var("FAKE_AGENT_OUTFILE").unwrap_or_else(|_| "hello.txt".into());
    let text = std::env::var("FAKE_AGENT_TEXT").unwrap_or_else(|_| "HELLO_AGENT_BRIDGE\n".into());

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

                // 2. Request permission for an edit (a file diff).
                let tool_call = ToolCallUpdate::new(
                    "edit-1",
                    ToolCallUpdateFields::new().content(vec![ToolCallContent::Diff(Diff::new(
                        outfile.clone(),
                        text.clone(),
                    ))]),
                );
                let options = vec![
                    PermissionOption::new(ALLOW_ID, "Allow", PermissionOptionKind::AllowOnce),
                    PermissionOption::new("reject", "Reject", PermissionOptionKind::RejectOnce),
                ];

                let outfile = outfile.clone();
                let text = text.clone();
                let conn = cx.clone();
                // 3. Drive the request from a spawned task (block_task is fine here,
                //    just not directly inside the handler). On the client's
                //    decision: apply the edit if allowed, then end the turn.
                cx.spawn(async move {
                    let response = conn
                        .send_request(RequestPermissionRequest::new(SESSION_ID, tool_call, options))
                        .block_task()
                        .await?;
                    let accepted = matches!(
                        &response.outcome,
                        RequestPermissionOutcome::Selected(sel) if &*sel.option_id.0 == ALLOW_ID
                    );
                    if accepted {
                        std::fs::write(&outfile, &text)
                            .map_err(agent_client_protocol::util::internal_error)?;
                    }
                    responder.respond(PromptResponse::new(StopReason::EndTurn))?;
                    Ok(())
                })
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_to(Stdio::new())
        .await
}
