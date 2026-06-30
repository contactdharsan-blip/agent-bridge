# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: pre-implementation

This repo currently contains **only the planning docs** — there is no source code, build system, or tests yet. The two source-of-truth documents are:

- `agent-bridge-prd.md` — product requirements (what to build, for whom, success metrics).
- `agent-bridge-plan.md` — architecture, the two-engine model, milestones, and the vibecoding execution playbook. **Read §0, §1, §6, and §6b before writing any code.**

When implementation begins, update this file with real build/lint/test commands. Until then, treat the plan as binding architecture, not suggestion.

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
