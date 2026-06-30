# Agent Bridge

Drive **Claude Code** and **Codex** (Cursor later) from one surface. This is the
M1+M2 vertical slice: a Tauri shell + a Rust ACP host that spawns an agent
adapter, streams its response, and renders one accept/reject diff — with the
agent chosen purely by config (zero per-agent branches in the UI).

See `agent-bridge-prd.md` and `agent-bridge-plan.md` for the full vision.

## Layout

```
crates/acp-host/   🔴 the ACP transport core (frozen behind a narrow contract)
src-tauri/         Tauri v2 app crate (thin IPC glue over acp-host)
src/               React + TypeScript frontend (one agent-agnostic UI)
tests-e2e/         live smoke script
```

The core idea: the host translates every agent's ACP traffic into one
`AgentEvent` model (`crates/acp-host/src/contract.rs`). Nothing outside that
crate touches `agent_client_protocol`, and the frontend never branches on which
agent is running — adding an agent is a registry entry (`registry.rs`), not new
rendering code.

## Prerequisites

- Rust (stable), Node ≥ 22.
- Linux desktop build needs the Tauri system deps: `libwebkit2gtk-4.1-dev`,
  `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.
- An API key for whichever agent you use (bring-your-own; nothing is stored):
  `ANTHROPIC_API_KEY` (Claude) / `OPENAI_API_KEY` (Codex). See `bin/README.md`.

## Develop

```bash
npm install                       # frontend deps
npm run tauri dev                 # run the desktop app (needs a display + webkit)
```

## Test / lint

```bash
# The 🔴 core — fast, hermetic, no API key or network needed:
cargo test -p acp-host            # unit + offline transport (real subprocess over stdio)
cargo clippy -p acp-host --all-targets

# Frontend:
npm run typecheck                 # tsc --noEmit
npm run build                     # tsc + vite build

# Real-adapter gate tests (skip-guarded; need a key + Node + network):
ANTHROPIC_API_KEY=sk-... cargo test -p acp-host --test round_trip -- --ignored --nocapture
OPENAI_API_KEY=sk-...    cargo test -p acp-host --test round_trip codex_real_round_trip -- --ignored

# Live smoke (after any transport change):
ANTHROPIC_API_KEY=sk-... tests-e2e/smoke.sh claude
```

The `acp-host` public API + its tests are **frozen** once the real-adapter gate
is green (plan §6b): changes there require the test-first, run-for-real ritual,
not a drive-by refactor.

## Debugging the wire

Set `AGENT_BRIDGE_DEBUG_FRAMES=1` to log every ACP frame (stdin/stdout/stderr).
