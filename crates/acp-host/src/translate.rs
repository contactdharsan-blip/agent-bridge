//! Pure translation between `agent_client_protocol` wire types and our contract.
//!
//! 🟢 zone: no transport, no state — just `acp type in → contract type out`.
//! Everything here is exhaustively unit-tested below, so the host module can be
//! trusted to merely *route*, not *interpret*.

use agent_client_protocol::schema::v1::{
    ContentBlock, PermissionOption, PermissionOptionId, PermissionOptionKind, SessionUpdate,
    StopReason as AcpStopReason, ToolCallContent, ToolCallUpdate,
};

use crate::contract::{AgentEvent, Decision, PermissionReqId, SessionId, StopReason};

/// Extract plain text from a content block, if it carries any.
fn text_of(block: &ContentBlock) -> Option<&str> {
    match block {
        ContentBlock::Text(t) => Some(&t.text),
        _ => None,
    }
}

/// Translate a streamed session update into a UI event, or `None` if this update
/// type isn't surfaced in M1 (tool-call progress, plans, mode changes, …).
///
/// Edits are deliberately NOT taken from the update stream here — they're
/// surfaced via the permission request (see [`edit_from_permission`]) so the
/// hunk and its accept/reject affordance arrive together.
pub fn session_update_to_event(session: &SessionId, update: &SessionUpdate) -> Option<AgentEvent> {
    match update {
        SessionUpdate::AgentMessageChunk(chunk) => text_of(&chunk.content).map(|t| {
            AgentEvent::TextDelta {
                session: session.clone(),
                text: t.to_string(),
            }
        }),
        SessionUpdate::AgentThoughtChunk(chunk) => text_of(&chunk.content).map(|t| {
            AgentEvent::Thought {
                session: session.clone(),
                text: t.to_string(),
            }
        }),
        _ => None,
    }
}

/// Map ACP's closed stop-reason enum to our contract enum.
pub fn stop_reason(acp: &AcpStopReason) -> StopReason {
    match acp {
        AcpStopReason::EndTurn => StopReason::EndTurn,
        AcpStopReason::MaxTokens => StopReason::MaxTokens,
        AcpStopReason::MaxTurnRequests => StopReason::MaxTurnRequests,
        AcpStopReason::Refusal => StopReason::Refusal,
        AcpStopReason::Cancelled => StopReason::Cancelled,
        // `StopReason` is `#[non_exhaustive]`; tolerate future variants.
        other => StopReason::Other(format!("{other:?}")),
    }
}

/// Build an [`AgentEvent::EditHunk`] from a permission request's tool call, if it
/// contains a file diff. Returns `None` for permission requests that aren't edits
/// (e.g. a command-execution approval), which M1 doesn't render as a hunk.
pub fn edit_from_permission(session: &SessionId, tool_call: &ToolCallUpdate) -> Option<AgentEvent> {
    let request_id = PermissionReqId(tool_call.tool_call_id.0.to_string());
    let content = tool_call.fields.content.as_ref()?;
    content.iter().find_map(|c| match c {
        ToolCallContent::Diff(diff) => Some(AgentEvent::EditHunk {
            session: session.clone(),
            request_id: request_id.clone(),
            path: diff.path.clone(),
            old_text: diff.old_text.clone(),
            new_text: diff.new_text.clone(),
        }),
        _ => None,
    })
}

/// The permission-request id we expose to the UI for a given tool call.
pub fn permission_req_id(tool_call: &ToolCallUpdate) -> PermissionReqId {
    PermissionReqId(tool_call.tool_call_id.0.to_string())
}

/// A human-readable description for a non-diff permission ask (a shell
/// command approval, etc.) — the fallback [`edit_from_permission`] doesn't
/// cover. Prefers the tool call's own title; falls back to its coarse kind;
/// never empty, so [`AgentEvent::PermissionRequest`] always has something for
/// the UI to show instead of a bare "approve?".
pub fn permission_description(tool_call: &ToolCallUpdate) -> String {
    if let Some(title) = &tool_call.fields.title {
        if !title.trim().is_empty() {
            return title.clone();
        }
    }
    match tool_call.fields.kind {
        Some(kind) => format!("{kind:?} — approve this action?"),
        None => "Approve this action?".to_string(),
    }
}

/// Choose which permission option to select for the user's decision.
///
/// Accept prefers an allow-once option (never silently "allow always"); reject
/// prefers reject-once. Returns `None` when no matching option exists, signalling
/// the caller to respond with `Cancelled` instead.
pub fn select_option(decision: Decision, options: &[PermissionOption]) -> Option<PermissionOptionId> {
    let want_allow = matches!(decision, Decision::Accept);
    let prefer = |kinds: &[PermissionOptionKind]| {
        kinds.iter().find_map(|k| {
            options
                .iter()
                .find(|o| o.kind == *k)
                .map(|o| o.option_id.clone())
        })
    };
    if want_allow {
        prefer(&[
            PermissionOptionKind::AllowOnce,
            PermissionOptionKind::AllowAlways,
        ])
    } else {
        prefer(&[
            PermissionOptionKind::RejectOnce,
            PermissionOptionKind::RejectAlways,
        ])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::v1::{
        ContentChunk, Diff, TextContent, ToolCallUpdateFields,
    };

    fn sid() -> SessionId {
        SessionId("s1".into())
    }

    #[test]
    fn agent_message_chunk_becomes_text_delta() {
        let update = SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::Text(
            TextContent::new("hello"),
        )));
        match session_update_to_event(&sid(), &update) {
            Some(AgentEvent::TextDelta { text, .. }) => assert_eq!(text, "hello"),
            other => panic!("expected TextDelta, got {other:?}"),
        }
    }

    #[test]
    fn thought_chunk_becomes_thought() {
        let update = SessionUpdate::AgentThoughtChunk(ContentChunk::new(ContentBlock::Text(
            TextContent::new("hmm"),
        )));
        assert!(matches!(
            session_update_to_event(&sid(), &update),
            Some(AgentEvent::Thought { .. })
        ));
    }

    #[test]
    fn unhandled_updates_are_ignored() {
        // A plan update isn't surfaced in M1.
        let update = SessionUpdate::Plan(agent_client_protocol::schema::v1::Plan::new(vec![]));
        assert!(session_update_to_event(&sid(), &update).is_none());
    }

    #[test]
    fn stop_reasons_map() {
        assert_eq!(stop_reason(&AcpStopReason::EndTurn), StopReason::EndTurn);
        assert_eq!(stop_reason(&AcpStopReason::Cancelled), StopReason::Cancelled);
        assert_eq!(
            stop_reason(&AcpStopReason::MaxTurnRequests),
            StopReason::MaxTurnRequests
        );
    }

    #[test]
    fn diff_permission_becomes_edit_hunk() {
        let tc = ToolCallUpdate::new(
            "tc-1",
            ToolCallUpdateFields::new().content(vec![ToolCallContent::Diff(
                Diff::new("hello.txt", "HELLO_AGENT_BRIDGE\n"),
            )]),
        );
        match edit_from_permission(&sid(), &tc) {
            Some(AgentEvent::EditHunk {
                request_id,
                path,
                old_text,
                new_text,
                ..
            }) => {
                assert_eq!(request_id, PermissionReqId("tc-1".into()));
                assert_eq!(path.to_str(), Some("hello.txt"));
                assert_eq!(old_text, None);
                assert!(new_text.contains("HELLO_AGENT_BRIDGE"));
            }
            other => panic!("expected EditHunk, got {other:?}"),
        }
    }

    #[test]
    fn non_diff_permission_yields_no_hunk() {
        let tc = ToolCallUpdate::new("tc-2", ToolCallUpdateFields::new());
        assert!(edit_from_permission(&sid(), &tc).is_none());
    }

    #[test]
    fn permission_description_prefers_the_tool_calls_own_title() {
        let tc = ToolCallUpdate::new(
            "tc-3",
            ToolCallUpdateFields::new().title("Run `rm -rf /tmp/scratch`"),
        );
        assert_eq!(permission_description(&tc), "Run `rm -rf /tmp/scratch`");
    }

    #[test]
    fn permission_description_falls_back_to_kind_when_title_is_blank() {
        let tc = ToolCallUpdate::new(
            "tc-4",
            ToolCallUpdateFields::new().title("").kind(agent_client_protocol::schema::v1::ToolKind::Execute),
        );
        assert_eq!(permission_description(&tc), "Execute — approve this action?");
    }

    #[test]
    fn permission_description_never_empty_with_nothing_to_go_on() {
        let tc = ToolCallUpdate::new("tc-5", ToolCallUpdateFields::new());
        assert_eq!(permission_description(&tc), "Approve this action?");
    }

    #[test]
    fn select_option_prefers_once_variants() {
        let options = vec![
            PermissionOption::new("a", "Allow", PermissionOptionKind::AllowOnce),
            PermissionOption::new("aa", "Allow always", PermissionOptionKind::AllowAlways),
            PermissionOption::new("r", "Reject", PermissionOptionKind::RejectOnce),
        ];
        assert_eq!(
            select_option(Decision::Accept, &options),
            Some(PermissionOptionId::new("a"))
        );
        assert_eq!(
            select_option(Decision::Reject, &options),
            Some(PermissionOptionId::new("r"))
        );
    }

    #[test]
    fn select_option_none_when_no_match() {
        let options = vec![PermissionOption::new(
            "a",
            "Allow",
            PermissionOptionKind::AllowOnce,
        )];
        // No reject option present → caller should fall back to Cancelled.
        assert_eq!(select_option(Decision::Reject, &options), None);
    }
}
