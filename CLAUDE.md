# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: M1–M7 (engine layer) + the post-M7 client surface implemented

The two source-of-truth documents remain binding architecture:

- `agent-bridge-prd.md` — product requirements (what to build, for whom, success metrics). §13 is the expanded feature set (FR24–FR50).
- `agent-bridge-plan.md` — architecture, the two-engine model, milestones, and the vibecoding execution playbook. **Read §0, §1, §6, and §6b before writing any code.**
- `agent-bridge-ui-prd.md` — the Client Surface (UI/UX) PRD (UI-FR1–28): the four-tab frontend that consumes the 15 wired IPC commands. Now implemented (UI-1…UI-4); onboarding wizard (UI-FR28) deferred.
- `tasks/todo.md` (engineering backlog) and `tasks/operator-todo.md` (human-only steps: secrets, signing, product decisions).

What exists now — the 🔴 runtime spine plus the 🟢/🟡 pure engines that are the moat:

- `crates/acp-host/` — 🔴 the ACP transport core, frozen behind the narrow `AcpHost` trait + `AgentEvent` model in `contract.rs`. Built on Zed's `agent-client-protocol` crate (pinned `=1.0.1`). Adapters in `registry.rs` (Claude/Codex via `npx`; Cursor via `cursor-agent`, overridable with `CURSOR_ACP_COMMAND`). Per-agent `AuthStatus`. Tested offline (unit + real-subprocess transport).
- `crates/canonical/` — 🟢 the single-source-of-truth model. Secrets are *references* (`SecretRef`), never literals.
- `crates/projection/` — 🟢 the Projection Engine: bidirectional MCP projectors (Claude/Cursor JSON, Codex TOML), instructions ("equivalent, not identical"), skill placement, AGENTS.md pass-through, Cursor 40-tool ceiling, and drift detection. Round-trip identity tests against golden fixtures.
- `crates/handoff/` — 🟡 the Handoff Bridge: `ContextSnapshot` → an honest "reconstructed brief, not a continued session" opening turn. Deterministic.
- `crates/profile/` — 🟡 the cross-agent moat: strict `CoderProfile` schema + boundary validator, platform-feature matching, confidence-weighted merge (hand-computed table test), Gap-Filling Engine (equivalent/approximation), Workflow Continuity Report.
- `crates/secrets/` — 🟡 keychain storage + spawn-time `${VAR}` resolution; the literal token never touches disk (security test asserts it).
- `skills/profile/` — the authored Profile Skill (`SKILL.md` + JSON Schema + gather script) the Projection Engine deploys into all three agents.
- `src-tauri/` — Tauri v2 app; `commands.rs` (runtime shell) + `engines.rs` (thin IPC over the pure engines).
- `src/` — React + TypeScript frontend; one agent-agnostic UI (zero per-agent branches); `ipc.ts` + `engines.ts` are the only IPC chokepoints. Four tabs (`components/` + `components/config|handoff|profile/`): Run shell, Config/Projection, Handoff, Profile/Continuity. Canonical state lives in `state/canonical.tsx` (Context). Styling is the Dark Liquid-Glass design system in `App.css` (CSS tokens as the base layer). Component/animation libraries are now allowed (operator decision 2026-07-01, superseding the earlier zero-dep rule): `framer-motion` for transitions and `@radix-ui/react-*` for accessible primitives (tabs, tooltip, dialog). Rules that still apply: gate all motion through a root `MotionConfig reducedMotion="user"` (never per-component `prefers-reduced-motion` checks); never animate a *blocking* honesty gate (drift review, carry-diff ack) in a way that lets it be skipped, auto-dismissed, or obscured — animate the surface around the gate, not the gate's requirement to be read; keep the hand-authored inline-SVG `Icon` set (no emoji) rather than pulling an icon library — it already covers the app's icon set with no added dependency.

### Build / lint / test commands

```bash
# Pure engines — hermetic, no API key/network, no Tauri build (disk-cheap):
cargo test -p canonical -p projection -p handoff -p profile -p secrets
cargo test -p acp-host                       # 🔴 core: unit + offline transport
cargo clippy --workspace --all-targets

# Frontend (hermetic — no key/network/display, no Tauri build):
npm install && npm run typecheck && npm run build && npm test

# Tauri app compiles (needs dist/ from `npm run build` first):
cargo check -p agent-bridge
npm run tauri dev                            # run it (needs a display + Linux webkit deps)

# Skip-guarded gates the operator runs (need keys / a real keychain):
ANTHROPIC_API_KEY=sk-... cargo test -p acp-host --test round_trip -- --ignored
cargo test -p secrets real_keychain_round_trip -- --ignored
ANTHROPIC_API_KEY=sk-... tests-e2e/smoke.sh claude
```

The `acp-host` public API + its transport tests are **frozen** (plan §6b): change them only via the test-first, run-for-real ritual; adding an agent is a `registry.rs` row, not new code. `AGENT_BRIDGE_DEBUG_FRAMES=1` logs raw ACP traffic. The pure engines are 🟢/🟡 — verify by running their tests, not by reading diffs.

### Client surface (built — post-M7 UI milestone)
The four-tab React UI that *consumes* the wired engine commands is implemented (`agent-bridge-ui-prd.md`, UI-FR1–26): the Run shell (tabs, auth badges, cancel, honest turn-end), the Config/Projection panel (canonical form editor → per-target preview + Cursor tool-ceiling + equivalent-not-identical instructions + **blocking** drift review + secret-binding manager), the Handoff panel (snapshot → blocking carry-diff → reconstructed brief → re-inject), and the Profile/Continuity dashboard (run-via-session → `validate_profile` → merge with per-agent confidence → recommendations + four-bucket continuity + equivalent/approximation gap-fills). Verify with `npm run typecheck && npm run build` (hermetic, disk-cheap — no Tauri build). The honesty affordances (NFR2) are hard UI requirements and are all sourced from real backend fields, never hard-coded copy — do not weaken them.

### What's left (not yet built)
- **UI-FR28 onboarding wizard** — deferred to a later milestone (per-agent auth badges + docs link cover setup for now).
- **Actual native-config disk writes** — the Config panel reviews + copies the approved artifact; a real Tauri-fs write is outside the 15-command engine boundary by design (a fs-plugin follow-up, not a core change).
- Operator/product items in `tasks/operator-todo.md` (signing, marketplace curation, pricing).

## What this is

**Agent Bridge** — a Tauri desktop app that lets one developer drive **Claude Code, Codex, and Cursor** from a single surface: projecting their MCP servers / skills / instructions into each agent's native format, bridging context when they switch agents, and building a cross-agent profile of how they code. The product's reason to exist is the seam *between* the three tools, not any one of them.

## Core mental model (the one idea everything rests on)

Two fundamentally different kinds of portability — never conflate them:

- **Substrate-portable** — has (or can have) a shared format: MCP configs, `SKILL.md` skills, `AGENTS.md`, custom instructions. These can be made *genuinely seamless* → handled by the **Projection Engine**.
- **Reconstruction-only** — each agent keeps it private and never shares it: live conversation memory, in-flight session state. These can only be *bridged* (summarized + re-injected), never *migrated* → handled by the **Handoff Bridge**.

The product feels great when it makes substrate-portable layers invisible and makes the reconstruction layer **explicit, fast, and honestly labeled**. It feels broken the moment it pretends reconstruction is seamless and silently drops state. "Honesty by design" (memory is bridged not migrated; instructions are equivalent not identical; profile confidence shown per agent) is a hard UX constraint — see PRD NFR2.

## Architecture

Planned stack: **Tauri** (Rust core + web frontend), agents spawned as subprocesses over **ACP** (Agent Client Protocol) via JSON-RPC over stdio.

```
Web Frontend (unified thread/diff UI)  ⇄ IPC ⇄  Rust Core
                                                  • ACP Client Host (spawn + talk to each agent)
                                                  • Projection Engine
                                                  • Handoff Bridge
                                                  • Canonical Store (SQLite + on-disk files)
                                                          │ JSON-RPC over stdio (ACP)
                            claude-agent-acp / codex adapter / cursor adapter (subprocesses)
```

Key structural decisions:

- **ACP is the spine.** All three agents speak ACP, so the frontend renders **one** message model (text deltas, tool calls, edit hunks, task lists) for all of them. You are building an ACP *client host*, not three bespoke integrations. Lean on Zed's `agent-client-protocol` Rust crate — do not hand-roll transport.
- **Canonical Store is the single source of truth.** Native config files (`~/.claude.json`/`.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json`, `CLAUDE.md`, `.cursorrules`, etc.) are **generate-only artifacts** — the app writes them, the user edits the canonical entity, never the reverse.
- **Two engines, distinct responsibilities.** Projection Engine = pure `canonical → native format` functions (one projector per target). Handoff Bridge = capture a `ContextSnapshot` from the outgoing agent, re-inject as the incoming agent's opening turn.
- **Bundle adapter binaries.** Users install no extra toolchain; ship prebuilt ACP adapter binaries.
- **Secrets never inlined.** Config projection references env vars / OS keychain entries — never literal tokens in generated files.

## The differentiating layer (don't treat as plumbing)

The moat is three things nothing else does together, in priority order — see plan §5b and PRD §10:

1. The unified runtime shell over all three agents.
2. The **Handoff Bridge** (honest context handoff on switch).
3. The **cross-agent Vibe-Coder Profile + Workflow Continuity Report** — the only genuinely unserved piece, since no vendor compares usage across all three tools.

The profile is produced by **one authored `SKILL.md` Profile Skill** deployed into all three agents via the Projection Engine. It runs natively inside each agent (uses that agent's own model — no separate API key), reads local history, and emits **strict `CoderProfile` JSON** against a shared closed-enum schema so the three outputs are comparable by construction. The Rust core merges the three blobs confidence-weighted by data volume. Everything stays local-first; only aggregate JSON is ever collected — never raw transcripts or source.

The **Gap-Filling Engine** turns "feature parity" into "skill substitution": when a capability doesn't map one-to-one between harnesses, resolve it with a skill — recommend an existing marketplace/GitHub skill first, generate a custom one otherwise. Mark each as "equivalent" vs "approximation."

## Trust zones — the build discipline that overrides default behavior

This codebase's hardest parts **do not reveal their bugs in a diff** (concurrent/stateful/transport code fails at runtime, under timing, not on the page). The whole plan is organized to push complexity to verifiable edges. Before accepting or producing any change, know which zone it is in (plan §6b):

| Zone | What's in it | How it's verified | Trust a diff review? |
|---|---|---|---|
| 🟢 **Pure** | Projectors, generators, matching map, `SKILL.md` authoring | Round-trip / snapshot tests the agent writes and runs | No need — trust the passing test |
| 🟡 **Stateful-but-local** | Handoff snapshot assembly, profile merge, instruction-projection semantics | Hand-written table tests with known I/O; run the real flow and read the result | Partly — review logic, confirm by execution |
| 🔴 **Concurrent/transport** | ACP host (spawn, JSON-RPC, streaming), new adapters, keychain | Integration test against a real adapter binary; manual run per OS | No — a clean-looking diff here is the trap |

Rules that follow from this (apply throughout, not just when convenient):

- **~70% of the app is 🟢 by design.** The Projection and Gap-Filling engines — the actual moat — are pure functions. Keep them pure: input in, file out, no state. Verify with round-trip tests (canonical → native → canonical → diff = identity).
- **The 🔴 core is small and frozen behind a contract.** Once the ACP host's integration test is green, do not casually refactor it. Changes to 🔴 code require the same "write the test first, run it for real" ritual — never a drive-by cleanup. Most regressions here will come from an agent helpfully touching frozen 🔴 code.
- **Demand the test first for 🟢/🟡 work** — write the round-trip/table test, show it failing, then make it pass. Review the test, then trust the green check.
- **Keep diffs reviewable.** One projector per turn, not "build the Projection Engine." A >~150-line diff in a 🟡/🔴 zone is being rubber-stamped, not reviewed — split it.
- **Validate every Profile Skill output against a strict JSON Schema at the boundary** and reject non-conforming output, so loose JSON can't silently corrupt the merge.

## Build sequence

Build the **thinnest vertical slice through all layers first** — do not build the satisfying pure-function engines before the spine runs. Milestones (plan §6), each ending in a runnable artifact:

- **M1 🔴** One agent (Claude) end-to-end: Tauri shell + Rust ACP host → one streamed response + one accept/reject diff. Riskiest; do it first, gate behind a real-adapter integration test, then freeze. Don't start M2 until that test is green.
- **M2 🟡** Add Codex as a *config entry*, not new rendering code. Win condition = zero `if agent == codex` branches in the UI.
- **M3 🟢** Projection Engine v1 (MCP): canonical → JSON ×2 + TOML; round-trip identity test; Cursor ~40-tool ceiling warning.
- **M4 🟢** Skills + `AGENTS.md` placement + instructions projection ("equivalent-not-identical" labeling); snapshot tests.
- **M5 🟡** Handoff Bridge (`ContextSnapshot` capture + re-injection). Centerpiece UX.
- **M5b 🟡** Profile Skill v1 in Claude first; strict `CoderProfile` JSON; profile-to-platform matching map.
- **M5c 🟡** Same skill in Codex + Cursor; confidence-weighted merge (pin with table-driven tests — silent-wrong failure mode); Gap-Filling Engine + Workflow Continuity Report.
- **M6 🔴** Cursor as third agent (weakest ACP adapter — stress test, not foundation; architecture must not depend on it).
- **M7 🟢** Polish: drift detection, per-agent auth status, keychain (🟡 — test by storing/retrieving a throwaway secret per OS), onboarding.

## Verification you can run, not just read

Because diff-review fails on the hard parts, lean on executable artifacts (plan §6b):

- **Golden-config fixtures** — real `.mcp.json` / `config.toml` / `.cursorrules` from actual installs, committed as test fixtures. Every projector change runs against them. Build at M3; never delete from it.
- **Live smoke script** — spawns each adapter, sends one canned prompt, asserts response shape. Run after any 🔴 change; it's the only thing that catches transport regressions.
- **JSON Schema on every skill output** — validated and rejected at the boundary.

Three places to slow down / get a second pass: ACP host error/timeout handling (a hung subprocess with no timeout looks fine in every demo), profile-merge weighting (silent-wrong, not loud-wrong), and secrets handling (a bug here is a security incident — verify by grepping a generated config for a token and finding nothing).

## Open decisions (resolve before the code they affect)

From PRD §11 / plan §8 — flag these rather than silently picking:

- Canonical store: SQLite + on-disk files, or files-only with git-style history?
- Handoff digest source: outgoing agent vs. a dedicated cheap summarizer model (cost vs. fidelity)?
- v1 knowledge-base scope: `AGENTS.md` + instructions only, or a richer projected doc store?
- Profile depth vs. run cost: default history window + a "deep scan" option?
- Comparative/aggregated profiles + third-party skill marketplace: in v1 or deferred?
