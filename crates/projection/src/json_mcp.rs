//! JSON MCP projector — Claude `.mcp.json` and Cursor `.cursor/mcp.json` share
//! the `{ "mcpServers": { <name>: {...} } }` shape, so one module serves both.
//!
//! Per-entry shape:
//! - stdio: `{ "command", "args"?, "env"? }`
//! - http:  `{ "type": "http", "url", "headers"? }`
//!
//! Servers are emitted sorted by name for deterministic, snapshot-stable output.

use std::collections::BTreeMap;

use canonical::{EnvVar, Header, McpServer, McpTransport};
use serde_json::{json, Map, Value};

use crate::{classify, ProjectionError, Target};

/// Emit the JSON config for the given (already filtered, active) servers.
pub(crate) fn project(servers: &[&McpServer]) -> String {
    let mut sorted: Vec<&&McpServer> = servers.iter().collect();
    sorted.sort_by(|a, b| a.name.cmp(&b.name));

    let mut entries = Map::new();
    for s in sorted {
        entries.insert(s.name.clone(), project_one(s));
    }

    let root = json!({ "mcpServers": Value::Object(entries) });
    // Pretty + trailing newline — the conventional shape of a hand-written config.
    format!("{}\n", serde_json::to_string_pretty(&root).expect("Value always serializes"))
}

/// Build the JSON object for one server.
fn project_one(s: &McpServer) -> Value {
    let mut obj = Map::new();
    match &s.transport {
        McpTransport::Stdio { command, args, env } => {
            obj.insert("command".into(), Value::String(command.clone()));
            if !args.is_empty() {
                obj.insert("args".into(), Value::Array(args.iter().cloned().map(Value::String).collect()));
            }
            if !env.is_empty() {
                obj.insert("env".into(), env_object(env));
            }
        }
        McpTransport::Http { url, headers } => {
            // Mark the transport explicitly so re-parsing is unambiguous.
            obj.insert("type".into(), Value::String("http".into()));
            obj.insert("url".into(), Value::String(url.clone()));
            if !headers.is_empty() {
                obj.insert("headers".into(), header_object(headers));
            }
        }
    }
    Value::Object(obj)
}

/// `{ KEY: rendered_value }` for env entries — secrets render as `${VAR}`.
fn env_object(env: &[EnvVar]) -> Value {
    let mut m = Map::new();
    for e in env {
        m.insert(e.key.clone(), Value::String(e.value.rendered()));
    }
    Value::Object(m)
}

/// `{ Header: rendered_value }`.
fn header_object(headers: &[Header]) -> Value {
    let mut m = Map::new();
    for h in headers {
        m.insert(h.name.clone(), Value::String(h.value.rendered()));
    }
    Value::Object(m)
}

/// Parse a JSON `mcpServers` config back into canonical servers.
pub(crate) fn parse(target: Target, contents: &str) -> Result<Vec<McpServer>, ProjectionError> {
    let root: Value = serde_json::from_str(contents).map_err(|e| ProjectionError::Syntax {
        target,
        detail: e.to_string(),
    })?;

    let servers = root.get("mcpServers").and_then(Value::as_object).ok_or_else(|| {
        ProjectionError::Shape {
            target,
            path: "mcpServers".into(),
            detail: "missing or not an object".into(),
        }
    })?;

    // Iterate in sorted order so the parsed Vec is deterministic.
    let ordered: BTreeMap<&String, &Value> = servers.iter().collect();
    let mut out = Vec::new();
    for (name, def) in ordered {
        out.push(parse_one(target, name, def)?);
    }
    Ok(out)
}

/// Parse one server entry. `command` ⇒ stdio; else `url` ⇒ http.
fn parse_one(target: Target, name: &str, def: &Value) -> Result<McpServer, ProjectionError> {
    let obj = def.as_object().ok_or_else(|| ProjectionError::Shape {
        target,
        path: format!("mcpServers.{name}"),
        detail: "entry is not an object".into(),
    })?;

    let transport = if let Some(command) = obj.get("command").and_then(Value::as_str) {
        let args = obj
            .get("args")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        let env = obj
            .get("env")
            .and_then(Value::as_object)
            .map(|m| {
                m.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| EnvVar { key: k.clone(), value: classify(s) }))
                    .collect()
            })
            .unwrap_or_default();
        McpTransport::Stdio { command: command.to_string(), args, env }
    } else if let Some(url) = obj.get("url").and_then(Value::as_str) {
        let headers = obj
            .get("headers")
            .and_then(Value::as_object)
            .map(|m| {
                m.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| Header { name: k.clone(), value: classify(s) }))
                    .collect()
            })
            .unwrap_or_default();
        McpTransport::Http { url: url.to_string(), headers }
    } else {
        return Err(ProjectionError::Shape {
            target,
            path: format!("mcpServers.{name}"),
            detail: "entry has neither `command` (stdio) nor `url` (http)".into(),
        });
    };

    Ok(McpServer { name: name.to_string(), transport, tool_count: None, disabled: false })
}
