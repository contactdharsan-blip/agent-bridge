# Agent Bridge

Drive **Claude Code**, **Codex**, and **Cursor** from one surface: a Tauri shell
+ a Rust ACP host that spawns an agent adapter, streams its response, and renders
one accept/reject diff — with the agent chosen purely by config (zero per-agent
branches in the UI) — plus pure engines that project your config into each
agent's format, bridge context on switch, and build a cross-agent coder profile.

Milestones M1–M7 are implemented. See `agent-bridge-prd.md` and
`agent-bridge-plan.md` for the full vision, and `tasks/operator-todo.md` for the
human-only steps that remain (secrets, signing, product decisions).

## Layout

```
crates/acp-host/   🔴 the ACP transport core (frozen behind a narrow contract)
crates/canonical/  🟢 the single-source-of-truth model (secrets are references)
crates/projection/ 🟢 Projection Engine: MCP/instructions/skills + drift detection
crates/handoff/    🟡 Handoff Bridge: ContextSnapshot → honest opening brief
crates/profile/    🟡 cross-agent profile: schema, merge, gap-filling, continuity
crates/secrets/    🟡 keychain storage + spawn-time secret resolution
skills/profile/    the authored Profile Skill (SKILL.md + JSON Schema + script)
src-tauri/         Tauri v2 app crate (commands.rs + engines.rs IPC glue)
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
# The pure engines — hermetic, no API key/network, no Tauri build (disk-cheap):
cargo test -p canonical -p projection -p handoff -p profile -p secrets
# The 🔴 core — fast, hermetic, real subprocess over stdio:
cargo test -p acp-host            # unit + offline transport
cargo clippy --workspace --all-targets

# Frontend:
npm run typecheck                 # tsc --noEmit
npm run build                     # tsc + vite build
cargo check -p agent-bridge       # the Tauri app compiles (needs dist/ from build)

# Real-adapter gate tests (skip-guarded; need a key + Node + network):
ANTHROPIC_API_KEY=sk-... cargo test -p acp-host --test round_trip -- --ignored --nocapture
OPENAI_API_KEY=sk-...    cargo test -p acp-host --test round_trip codex_real_round_trip -- --ignored
# Cursor is the weakest leg; set CURSOR_ACP_COMMAND if the default isn't your adapter:
CURSOR_API_KEY=... cargo test -p acp-host --test round_trip cursor_real_round_trip -- --ignored

# Real OS keychain round-trip (per OS; may prompt / be unavailable in headless CI):
cargo test -p secrets real_keychain_round_trip -- --ignored

# Live smoke (after any transport change):
ANTHROPIC_API_KEY=sk-... tests-e2e/smoke.sh claude
```

The `acp-host` public API + its tests are **frozen** once the real-adapter gate
is green (plan §6b): changes there require the test-first, run-for-real ritual,
not a drive-by refactor.

## Debugging the wire

Set `AGENT_BRIDGE_DEBUG_FRAMES=1` to log every ACP frame (stdin/stdout/stderr).
