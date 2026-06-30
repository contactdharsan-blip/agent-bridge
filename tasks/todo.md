# Agent Bridge — Build TODO (M3 → M7)

Branch: `agent-bridge-m3-m7`. Baseline: M1+M2 (ACP host + Tauri shell + agent-agnostic UI) committed at `ec5296c`.

Discipline (plan §6b): pure crates are 🟢 — write the test first, run it for real, trust the green. The 🔴 ACP host is frozen; do not touch it. Verify pure crates with `cargo test -p <crate>` (serde-only deps, no Tauri build → disk-cheap).

## Prioritized milestones

- [x] **Setup** — feature branch, task files, golden-config fixtures dir.
- [x] **M3 🟢 — Projection Engine v1 (MCP).** DONE @ `581d5f4`. canonical + projection crates; bidirectional projectors; round-trip identity; Cursor ceiling; no inlined secrets. 18 tests.
- [x] **M4 🟢 — Skills + AGENTS.md + instructions projection.** DONE. instructions (3 targets, equivalent-not-identical flag baked in), skill placement planner + verbatim copy, AGENTS.md pass-through. 26 projection tests total.
- [x] **M5 🟡 — Handoff Bridge.** DONE @ `df03526`. handoff crate; deterministic brief; honest framing. 5 tests.
- [x] **M5b 🟡 — Profile Skill v1.** DONE @ `947e1ab`. strict schema + boundary validator + matching map; SKILL.md + JSON Schema + gather script. 13 tests.
- [x] **M5c 🟡 — Cross-agent profile + Gap-Filling + Continuity.** DONE. Confidence-weighted merge (hand-computed table test), Gap-Filling Engine (equivalent/approximation), 4-section Continuity Report. 28 profile tests total.
- [ ] **M6 🔴 — Cursor as third agent.** Registry config entry (projector already supports Cursor from M3). Document the un-verifiable-offline adapter caveat.
- [ ] **M7 🟢/🟡 — Polish.** Drift detection (hand-edit flagging), per-agent auth status, keychain secret storage (🟡, per-OS), onboarding/docs, wire Tauri commands for projection/profile.

## Cross-cutting (build once, never delete)
- Golden-config fixtures (real `.mcp.json` / `config.toml` / `.cursor/mcp.json`) — build at M3.
- JSON Schema on every Profile Skill output — validate + reject at the boundary (M5b).
- Live smoke script already exists (`tests-e2e/smoke.sh`).

## Notes / decisions made autonomously
- Canonical store: SQLite + files was an open question → starting **files/in-memory model only** (no DB yet); the model is DB-agnostic so SQLite can wrap it later. Pure-function engine doesn't need persistence to be correct/tested.
- Secrets: canonical `ConfigValue::Secret` holds only a *reference* (env var / keychain), never a literal — strongest possible "no inlined token" guarantee (the literal never enters the model).
