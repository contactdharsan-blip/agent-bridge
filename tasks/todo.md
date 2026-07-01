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
- [x] **M6 🔴 — Cursor as third agent.** DONE @ `fef0c36`. Registry entry (operator-overridable command); UI agent-agnostic so Cursor appears free; skip-guarded gate added.
- [x] **M7 🟢/🟡 — Polish.** DONE. Drift detection (`0e1b6aa`), per-agent AuthStatus (`0e1b6aa`), keychain secrets + spawn resolution + security test, real macOS keychain verified (`01b2591`), Tauri IPC wiring for all engines + typed `engines.ts` (`f1badf2`), docs (this commit).

## All milestones M3–M7 complete. Post-M7 UI milestone (Client Surface) COMPLETE.

## Post-M7 UI milestone — Client Surface (`agent-bridge-ui-prd.md`) — COMPLETE (UI-1…UI-5)

Consumes only the 15 wired IPC commands (no backend/contract change; 🔴 core frozen).
Verify each with `npm run typecheck && npm run build` (disk-cheap; never build src-tauri).

Operator decisions (2026-07-01):
- **Layout:** top tab bar (styled as the design system's glass segmented control).
- **Config editing:** structured form over canonical entities + live projected preview.
- **Honesty gates:** blocking acknowledge — drift diff reviewed before write; carry-diff seen before brief.
- **Onboarding:** deferred to v1.1 → UI-FR28 (wizard) OUT this milestone; UI-FR27 (auth badges) IN.
- **Design language:** adopt the Dark Liquid-Glass design system (`~/Downloads/identification med/DESIGN.md`)
  via CSS tokens only — no Tailwind/Motion/lucide deps (disk-tight, Tauri). Spring feel via
  `--transition-spring`; reveals via CSS keyframes; `prefers-reduced-motion` gated; inline-SVG icons (no emoji).

Tasks (each = typecheck + build green, then commit):
- [x] **UI-1 Foundation.** DONE @ `e6696d7`. Dark liquid-glass tokens in App.css; inline-SVG `Icon` set; glass tab shell
      (Run/Config/Handoff/Profile); 3-state auth badges (connected/needsLogin/error, icon+text);
      cancel in-flight turn; honest turn-end + distinct thought rendering; `useAgentStream` extensions
      (`cancel`, `promptCapture`). (UI-FR1–8, UI-FR27)
- [x] **UI-2 Config / Projection panel.** Canonical form editor → `preview_mcp` (tool-ceiling warning) +
      `preview_instructions` (equivalent-not-identical badge + fidelityNote) + `check_drift` (blocking review) +
      `audit_secret_bindings` (`${VAR}` + resolvability, never a literal). (UI-FR9–15)
- [x] **UI-3 Handoff panel.** Client-side `ContextSnapshot` assembly + blocking carry-diff +
      `build_handoff_brief` + honest "reconstructed brief" label + re-inject on target session. (UI-FR16–18)
- [x] **UI-4 Profile / Continuity panel.** Run-via-session capture → `validate_profile` (boundary reject) +
      `merge_profiles` (per-agent weight AND confidence) + `recommend_features` + `workflow_continuity`
      (4 buckets incl. genuinelyLost) + `gap_fills_for` (equivalent/approximation, source-before-install,
      generated-skill as diff). (UI-FR19–26)
- [x] **UI-5 Docs + ship.** README + CLAUDE.md + lessons updated; UI-FR28 deferral recorded. Branch pushed.

## v1.1 client-surface addendum (`agent-bridge-ui-prd.md` §11–12) — IN PROGRESS

Pure-frontend batch — no backend change, no Tauri build. Verify each with
`npm run typecheck && npm run build`; §12 adds a Vitest unit suite (`npm test`).

- [x] **UI-6 Toasts (UI-FR31).** ToastProvider + useToast; wire copy/error/success across panels.
- [x] **UI-7 Persistence (UI-FR30).** localStorage for canonical store + collected profiles + settings (tab, accent).
- [x] **UI-8 Command palette + shortcuts (UI-FR29, UI-FR32).** ⌘K palette (fuzzy, keyboard-operated); tab hotkeys 1–4; Esc cancels/closes.
- [ ] **UI-9 Onboarding (UI-FR28).** Inline first-run setup checklist in the shell (agent status + login pointers + first-profile nudge).
- [ ] **UI-10 Export/import + accent theming (UI-FR33, UI-FR34).** Download/upload profile JSON (import via validate_profile); emerald/sky/violet accent switch.
- [ ] **UI-11 Vitest suite (§12).** Hermetic unit tests over extractJson / dominantProfile / stopNote / thread-append / toCanonical / persistence round-trip. `npm test` green.

### Audit + verify phase (goal: verify the rest of the product works)
- [ ] Run Rust test suite (pure crates + acp-host offline) — confirm engine layer still green.
- [ ] Run a multi-agent audit workflow over the frontend + honesty affordances.
- [ ] Frontend gate green (typecheck + build + npm test); app-level smoke.

### Not in scope (operator / later)
- Real native-config disk writes — needs a Tauri fs-plugin follow-up (touches Rust, disk-gated).
- `tasks/operator-todo.md` — human-only items (keys, signing, marketplace curation, pricing).

## Cross-cutting (build once, never delete)
- Golden-config fixtures (real `.mcp.json` / `config.toml` / `.cursor/mcp.json`) — build at M3.
- JSON Schema on every Profile Skill output — validate + reject at the boundary (M5b).
- Live smoke script already exists (`tests-e2e/smoke.sh`).

## Notes / decisions made autonomously
- Canonical store: SQLite + files was an open question → starting **files/in-memory model only** (no DB yet); the model is DB-agnostic so SQLite can wrap it later. Pure-function engine doesn't need persistence to be correct/tested.
- Secrets: canonical `ConfigValue::Secret` holds only a *reference* (env var / keychain), never a literal — strongest possible "no inlined token" guarantee (the literal never enters the model).
