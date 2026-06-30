//! Codex TOML MCP projector — `.codex/config.toml`, `[mcp_servers.<name>]`.
//!
//! Per-entry shape:
//! - stdio: `command`, `args`?, `env`? (sub-table)
//! - http:  `url`, `http_headers`? (sub-table)
//!
//! Codex's remote-MCP format is still evolving (plan §5b caveat); the stdio
//! shape is stable and is what real installs use. Both round-trip through this
//! module. Servers are emitted sorted by name for deterministic output.

use canonical::{EnvVar, Header, McpServer, McpTransport};
use toml::value::{Table, Value};

use crate::{classify, ProjectionError, Target};

/// Emit the Codex `config.toml` for the given active servers.
pub(crate) fn project(servers: &[&McpServer]) -> String {
    let mut sorted: Vec<&&McpServer> = servers.iter().collect();
    sorted.sort_by(|a, b| a.name.cmp(&b.name));

    let mut mcp = Table::new();
    for s in sorted {
        mcp.insert(s.name.clone(), Value::Table(project_one(s)));
    }

    let mut root = Table::new();
    if !mcp.is_empty() {
        root.insert("mcp_servers".into(), Value::Table(mcp));
    }
    // `to_string` renders nested tables as `[mcp_servers.name]` sections.
    toml::to_string_pretty(&Value::Table(root)).expect("Value always serializes")
}

/// Build the TOML table for one server.
fn project_one(s: &McpServer) -> Table {
    let mut t = Table::new();
    match &s.transport {
        McpTransport::Stdio { command, args, env } => {
            t.insert("command".into(), Value::String(command.clone()));
            if !args.is_empty() {
                t.insert(
                    "args".into(),
                    Value::Array(args.iter().cloned().map(Value::String).collect()),
                );
            }
            if !env.is_empty() {
                t.insert("env".into(), Value::Table(env_table(env)));
            }
        }
        McpTransport::Http { url, headers } => {
            t.insert("url".into(), Value::String(url.clone()));
            if !headers.is_empty() {
                t.insert("http_headers".into(), Value::Table(header_table(headers)));
            }
        }
    }
    t
}

fn env_table(env: &[EnvVar]) -> Table {
    let mut t = Table::new();
    for e in env {
        t.insert(e.key.clone(), Value::String(e.value.rendered()));
    }
    t
}

fn header_table(headers: &[Header]) -> Table {
    let mut t = Table::new();
    for h in headers {
        t.insert(h.name.clone(), Value::String(h.value.rendered()));
    }
    t
}

/// Parse a Codex `config.toml` back into canonical servers.
pub(crate) fn parse(contents: &str) -> Result<Vec<McpServer>, ProjectionError> {
    let target = Target::Codex;
    let root: Value = toml::from_str(contents).map_err(|e| ProjectionError::Syntax {
        target,
        detail: e.to_string(),
    })?;

    let servers = match root.get("mcp_servers") {
        Some(Value::Table(t)) => t,
        // A config with no MCP servers is valid → empty set.
        None => return Ok(Vec::new()),
        Some(_) => {
            return Err(ProjectionError::Shape {
                target,
                path: "mcp_servers".into(),
                detail: "not a table".into(),
            })
        }
    };

    // BTreeMap-like ordering: toml::Table preserves insertion order; sort for determinism.
    let mut names: Vec<&String> = servers.keys().collect();
    names.sort();
    let mut out = Vec::new();
    for name in names {
        out.push(parse_one(name, &servers[name])?);
    }
    Ok(out)
}

fn parse_one(name: &str, def: &Value) -> Result<McpServer, ProjectionError> {
    let target = Target::Codex;
    let t = def.as_table().ok_or_else(|| ProjectionError::Shape {
        target,
        path: format!("mcp_servers.{name}"),
        detail: "entry is not a table".into(),
    })?;

    let transport = if let Some(command) = t.get("command").and_then(Value::as_str) {
        let args = t
            .get("args")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        let env = t
            .get("env")
            .and_then(Value::as_table)
            .map(|m| {
                m.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| EnvVar { key: k.clone(), value: classify(s) }))
                    .collect()
            })
            .unwrap_or_default();
        McpTransport::Stdio { command: command.to_string(), args, env }
    } else if let Some(url) = t.get("url").and_then(Value::as_str) {
        let headers = t
            .get("http_headers")
            .and_then(Value::as_table)
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
            path: format!("mcp_servers.{name}"),
            detail: "entry has neither `command` (stdio) nor `url` (http)".into(),
        });
    };

    Ok(McpServer { name: name.to_string(), transport, tool_count: None, disabled: false })
}
