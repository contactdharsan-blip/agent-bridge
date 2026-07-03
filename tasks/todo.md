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
- [x] **UI-9 Onboarding (UI-FR28).** Inline first-run setup checklist in the shell (agent status + login pointers + first-profile nudge).
- [x] **UI-10 Export/import + accent theming (UI-FR33, UI-FR34).** Download/upload profile JSON (import via validate_profile); emerald/sky/violet accent switch.
- [x] **UI-11 Vitest suite (§12).** Hermetic unit tests over extractJson / dominantProfile / stopNote / thread-append / toCanonical / persistence round-trip. `npm test` green.
- [x] **UI-12 Onboarding tour (UI-FR28, previously deferred at line 29 above) + public Profile Skill repo (2026-07-01).** `OnboardingTour.tsx`: first-launch modal walkthrough across all 4 tabs, `data-tour-step`-targeted spotlight (measured via `getBoundingClientRect`, rendered in the tour's own portal — a class-on-target approach was tried first and rejected: framer-motion's animated tab panel + glass-card `backdrop-filter` both establish stacking contexts that cap a target-local z-index below the portal regardless of value), replayable via command palette + header info button; coexists with `OnboardingCard.tsx` (unchanged). `skills/profile/` mirrored to a new public repo (`github.com/contactdharsan-blip/agent-bridge-profile-skill`), wired into `gapfill.rs`'s `bundled:skills/profile` placeholder (now a real URL) and linked from the Profile tab. `npm run typecheck && npm run build && npm test` + `cargo test -p profile` green. **Not yet done: a real browser/Tauri-window pass to visually confirm the spotlight positioning** — no browser-automation tool was available in the session that built this; typecheck/build/test only prove it compiles and mounts, not that the spotlight renders where intended.
- [x] **UI-13 Vibecoder index card (2026-07-02).** `vibeIndex.ts`: pure `computeVibeIndex(MergedProfile)` reducing the *existing* merge output (taskMix/agents/strengths — no new data source) into an archetype label (mapped from the real 9-value `taskCategory` enum), a 0–100 `confidence` figure, dominant task category, and lead agent. `VibeIndexCard.tsx` renders it as a hero card above `MergedView` in the Profile tab's result column (not a 5th tab — kept inside the fixed 4-tab architecture per operator decision). First draft made the confidence number the 2.5rem hero — advisor caught this before ship: confidence is "how much data backs the profile," not a personality score, and headlining it violated NFR2 (confidence must never be blended into one smooth number that reads as a verdict). Fixed: the **archetype** is the hero, confidence is a small labeled `profile confidence: <band> (<n>)` chip using the same high/moderate/thin banding `MergedView`'s per-agent badges already use. Also hardened a `computeVibeIndex(merged)!` non-null assertion in `ProfilePanel.tsx` into a plain `vibeIndex &&` guard. Unit-tested (`vibeIndex.test.ts`, 6 cases incl. empty-merge null and confidence arithmetic). `npm run typecheck && npm run build && npm test` green (25/25 tests). **Not yet done: a real browser pass** — same caveat as UI-12, no browser-automation tool available this session; typecheck/build/test prove it compiles and mounts, not that the card lays out as intended.

### Audit + verify phase (goal: verify the rest of the product works)
- [x] Rust suite green — all pure crates + acp-host offline pass (0 failures).
- [x] Multi-agent audit workflow (4 dims × find → adversarial verify): 11 raw → 10 confirmed, 1 refuted.
- [x] Fixed all 10 (4 correctness @ `24254dd`, 6 a11y @ `87909dd`); typecheck + build + 19 tests green.
- [x] Focused re-verify workflow confirming each fix landed.
- [x] Frontend gate green — typecheck + build + 19 Vitest tests (incl. App render smoke).

### Not in scope (operator / later)
- Real native-config disk writes — needs a Tauri fs-plugin follow-up (touches Rust, disk-gated).
- `tasks/operator-todo.md` — human-only items (keys, signing, marketplace curation, pricing).

## v1.2 — animation/component libraries + desktop packaging (2026-07-01)

Operator decision: superseded the zero-dep design-system rule (`framer-motion` +
`@radix-ui/react-*` now allowed; see CLAUDE.md). Frontend-only except the last item.

- [x] **CLAUDE.md** updated: allowed stack + honesty-gate/reduced-motion constraints that still bind.
- [x] **TabBar** rebuilt on `@radix-ui/react-tabs` (real APG tablist); **CommandPalette** rebuilt on
      `@radix-ui/react-dialog` (real focus-trap + restore); Tooltip on the palette trigger.
- [x] **Animations**: root `MotionConfig reducedMotion="user"`; cross-fade between tab panels and for
      the onboarding card (`AnimatePresence`); toast enter/exit; connect-button hover/tap +
      spinning-while-connecting icon; drift-review/applied callouts fade in (gate logic untouched).
      Verified: `npm run typecheck && npm run build && npm test` — 19/19 green. Committed `17a00c1`.
- [x] **Desktop icons**: regenerated icns/ico from the existing 512x512 source via `tauri icon`,
      pruned the iOS/Android/MSIX assets it also generates (native mobile still out of scope), wired
      into `tauri.conf.json` bundle.icon. Committed `683239d`.
- [x] **`.github/workflows/desktop-build.yml`**: manual + tag-triggered matrix — macOS builds the
      `.dmg` natively, Windows builds the `.exe` (NSIS) natively. Not yet pushed/run.
- [x] **Local macOS `.dmg`**: built (`target/release/bundle/dmg/Agent Bridge_0.1.0_aarch64.dmg`).
      Tauri's Finder-styling AppleScript step needs a one-time Automation permission grant this
      machine doesn't have (see lessons.md) — worked around with a direct `hdiutil create` (valid,
      just unstyled). CI build on macos-latest won't hit this (fresh runner grants it automatically).
- [ ] Windows `.exe` — not built locally by design; runs when the workflow fires on a windows-latest
      runner (push a `v*.*.*` tag or trigger manually via Actions once this branch is pushed).
- [ ] Grant Automation permission for Finder to the local host app (System Settings → Privacy &
      Security → Automation) if a properly-styled local `.dmg` is wanted instead of the CI one.

## v1.3 — comprehensive UX audit + adversarial self-review (2026-07-02)

Standing goal: "audit and implement changes repeatedly on walkthrough, features,
UI/UX flows to make design better." Five multi-agent rounds (find → adversarial
verify), 15 commits (`f36e683`…`ca121bb`), each `npm run typecheck && npm run
build && npm test` green (27 tests). Headless Playwright now available → tour
visually verified (see lessons 2026-07-02).

- [x] Round 1 — visual/a11y/token/interaction/responsive (35 raw → 34 confirmed): `--text-*`/`--space-*` scales, `:focus-visible` rings on every control, 24px targets, status `-rgb`/`-fg` tokens, overflow/truncation guards, honest error banner (icon + headline + dismiss).
- [x] Round 2 — walkthrough + UX flows (23 confirmed): tour rebuilt **component-based** (transparent overlay, `.tour-highlight` on the real target — supersedes the measured getBoundingClientRect box), keyboard nav (Enter-advance), missing-target centering, card-overlap dodge; drift-gate `error` bypass (HIGH), double-onboarding, instructions Copy, checklist→4/4, carry-diff markers, named target files, auth re-check, merge-error honesty (HIGH), needs-login pre-flight, disconnect path, visible blocked-reasons. (`f36e683`…`5e7d3b7`)
- [x] Round 3 — leaf components (12 confirmed): ServerEditor delete-corrupts-survivor-args (HIGH), roving-tabindex accent radio, ARIA disclosure/status skeletons, AuthBadge "credentials found", ProfileCollector honest error cause + pluralization, PromptInput placeholder. (`697a7c7`)
- [x] Round 4 — adversarial self-review of the loop's own 15 commits (4 confirmed, all self-introduced): drift-gate `unreadable` bypass (HIGH — a commit message wrongly claimed it fixed this), tour focus race vs AnimatePresence `mode="wait"`, needs-login red→amber. (`be254e2`)
- [x] Round 5 — Vibecoder Index NFR2 (4 confirmed): single-agent fabricated "lean", plurality-as-majority blurb, thin-profile authority, tooltip-only confidence framing; +2 regression tests (27 total). (`ca121bb`)
- [x] Tour browser-pass (**closes the UI-12 caveat**): headless Playwright confirmed the component highlight lands on the real element, no full-screen blur, the card docks off the highlighted column, and Enter advances across steps without dismissing.
- [ ] VibeIndex card browser-pass (UI-13 caveat) — still open: the card renders only with a real merged profile (backend), not reachable in plain-browser dev; its logic is now NFR2-unit-tested, so layout stays operator-verifiable via `npm run tauri dev`.

## v1.4 — business-analysis gap closure: fs I/O, import wizard, permission presets, doctor (2026-07-02)

A business analysis of `agent-bridge-prd.md`/`agent-bridge-ui-prd.md` against the
build found two P0 gaps blocking the PRD's own Activation metric (no native-file
write *or* read path — `DriftWrite.tsx`'s `onDisk` was a manually-pasted
textarea) and two v1-tagged FRs never built (FR31 permission presets, FR32
doctor). Plan: `~/.claude/plans/lazy-coalescing-island.md`. Built as 3 parallel
worktree-isolated tracks, merged sequentially with full-gate verification after
each.

- [x] **Track 1 (P0) — native config I/O + import wizard (FR24, FR26).** `ba4928c`
      → merged `091fbd5`. `read_native_file`/`write_native_file` Tauri commands
      + `parse_native_mcp` engine command; `DriftWrite.tsx`/`InstructionsPreview.tsx`
      wired to real read/write with auto drift re-check, clipboard kept as
      fallback; `src/state/importConfig.ts` single-click import into canonical.
- [x] **Track 2 (P1) — permission presets, 2-tier (FR31).** `f07d2f0` → merged
      `d6d734f`. Scope-corrected from the PRD's literal 3-tier ask to 2 real
      presets (`default`/`acceptEdits`) — `AgentEvent` in `contract.rs` has only
      one permission-shaped variant (`EditHunk`), so a "bypass" tier would imply
      a distinction the frozen 🔴 contract doesn't have. Flagged a pre-existing,
      out-of-scope gap: `HandoffPanel`'s local `workingDirectory` can drift from
      `App.tsx`'s `cwd` after `switchWithBrief`, so the preset selector could show
      the wrong project's preset post-handoff — not introduced here, not fixed here.
- [x] **Track 3 (P1) — doctor diagnostics (FR32).** `4c78eff` → merged `b91ab5b`.
      `src-tauri/src/doctor.rs`: Node/npx version (timeout-wrapped), per-agent
      resolved command + auth status (reuses `registry::adapter_for`/
      `known_agents`), real keychain sentinel probe (execution-verified against
      the real macOS keychain during the build, then the throwaway test removed
      before commit — see lessons 2026-07-02).
- [x] **Integration.** 3 branches merged sequentially (Track 1 → 2 → 3) into
      `agent-bridge-m3-m7`; `lib.rs` handler-list and `App.tsx` palette-array
      conflicts resolved each time (both were simple "both sides appended a
      distinct entry" merges). Full gate green after every merge.
- [x] **Security fix mid-integration.** The commit-security-review hook flagged
      `native_config.rs`'s path guard as HIGH (path traversal): it validated the
      nearest-existing-ancestor but returned the raw joined path with any `..`
      still embedded. Fixed with a lexical `reject_traversal` pre-check (ban
      `ParentDir`/`RootDir`/`Prefix` components before touching the filesystem —
      closes the TOCTOU gap the ancestor-walk alone left open), `b226ed0`. A
      second pass (see lessons) closed a further dangling-symlink escape the
      lexical guard didn't cover.
- [x] **Track 4 — post-integration verification.** Rust: 46 workspace tests +
      clippy clean. Frontend: `npm run typecheck && npm run build && npm test`
      green (39 tests). DOM regression pass: `npm run dev` + headless Playwright
      (reused the `~/.npm/_npx` cache from the earlier tour-verification session,
      pointed at the cached `chromium-1208` browser directly since the npx
      package's expected build number had drifted) confirmed no tour
      `data-tour-step` target broke and the new Import button / permission
      preset selector / doctor panel all render. **Not done:** a real
      `npm run tauri dev` click-through — the browser-only harness has no real
      Tauri IPC backend, so `list_agents`/`start_session` fail immediately
      (expected, pre-existing behavior outside a real Tauri window) and anything
      gated behind a live connection (thread, composer, handoff carry-diff)
      couldn't be exercised this way. Operator-verifiable via `npm run tauri dev`.
- [x] **Track 5 — post-v1.4 security/honesty follow-ups (2026-07-02).** 4 fixes
      from the native-fs security audit, landed after the v1.4 docs commit:
      `b226ed0` closed a dangling-symlink escape in `native_config`'s path guard
      (+3 tests); `e6316b8` made `write_native_file` atomic (temp file + fsync +
      rename, same directory, so a crash never half-writes a hand-edited native
      file); `479fcf4` closed a HIGH honesty-gate hole where
      `InstructionsPreview`'s "Write instructions" could silently clobber a
      hand-edited CLAUDE.md/AGENTS.md/.cursorrules with no read/compare/confirm
      (same class DriftWrite already blocked for MCP config — the audit found
      the sibling site never got the pattern) + fixed `DriftWrite`'s own gate not
      resetting when the manual-paste text changed after a review; `00a3246`
      fixed `HandoffPanel`'s local `workingDirectory` drifting from `App.tsx`'s
      `cwd` post-switch (flagged during Track 2, fixed as a follow-up). Full gate
      re-verified 2026-07-03: `cargo test --workspace` (Rust, all green) +
      `cargo clippy --workspace --all-targets` (clean) + `npm run typecheck &&
      npm run build && npm test` (39/39) all green.

## Cross-cutting (build once, never delete)
- Golden-config fixtures (real `.mcp.json` / `config.toml` / `.cursor/mcp.json`) — build at M3.
- JSON Schema on every Profile Skill output — validate + reject at the boundary (M5b).
- Live smoke script already exists (`tests-e2e/smoke.sh`).

## Notes / decisions made autonomously
- Canonical store: SQLite + files was an open question → starting **files/in-memory model only** (no DB yet); the model is DB-agnostic so SQLite can wrap it later. Pure-function engine doesn't need persistence to be correct/tested.
- Secrets: canonical `ConfigValue::Secret` holds only a *reference* (env var / keychain), never a literal — strongest possible "no inlined token" guarantee (the literal never enters the model).
