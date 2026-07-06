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

## v1.3 — Audit-driven UI/UX rework (2026-07-03)

Full-app UI/UX audit run via a fork (read-only, `agent-bridge-ui-prd.md` +
`agent-bridge-prd.md` NFR2 vs every file in `src/`). Verdict per dimension:
aesthetic coherence MIXED, UX flow MIXED, honesty-by-design prominence MIXED
(most important finding — the visual weight doesn't match how load-bearing NFR2
says these signals are), IA MIXED, consistency MIXED. Full findings kept in this
session's transcript, not re-copied here — this section is the fix list.
Frontend-only, no backend/contract change. Verify each batch with
`npm run typecheck && npm run build && npm test`.

Explicit assumption (stated, not asked, per `/goal` autonomous-directive + Ask-Once
rule): font-honesty fix (item 4) drops the undeclared `"General Sans"`/
`"Bricolage Grotesque"` names rather than self-hosting real font files — the
higher-value spend this pass is the honesty-affordance visual weight (items 1-2),
not marginal typographic identity, and self-hosting adds a real asset-pipeline
dependency for a "safe polish" item the audit itself ranked lowest-risk/lowest-value.

- [x] **1. Elevate `.callout-honesty`** (App.css) to read as a first-class trust
      statement, not an FYI — thicker accent border + a small eyebrow label,
      distinct from generic `.callout`. CSS-only; lifts all 4 existing call sites
      (DriftWrite inSync/applied, InstructionsPreview fidelityNote, CarryDiff
      reconstructed-brief, ProfilePanel local-first-note) automatically.
- [x] **2. New `.badge-honesty` class**, distinct from `.badge-accent` — swap
      `InstructionsPreview`'s `equivalentNotIdentical` badge onto it so the honesty
      signal stops sharing visual vocabulary with decorative accent tags (e.g.
      GapFillItem's "for you", which stays `badge-accent` — it's not an honesty flag).
- [x] **3. Dedupe the `.app-title` CSS rule** (App.css has it declared twice).
- [x] **4. Font honesty** — drop the two undeclared custom font-family names,
      replace with an honest curated system stack (see assumption above).
- [x] **5. ServerEditor empty state** → swap the bare `<p className="card-sub">`
      for `<PanelEmpty>` (icon="config"), matching every other panel's empty-state
      investment (UI-NFR5 says every panel designs all four states, not a default).
- [x] **6. Toast auto-dismiss by kind** (`state/toast.tsx`) — errors get a longer
      window than success/info so a failure doesn't vanish as fast as a confirmation.
- [x] **7. Group header icon buttons** (App.tsx) — visually separate the 3
      functional buttons (⌘K, replay tour, doctor) from the cosmetic accent switcher.
- [x] **8. Shared `prefersReducedMotion()` helper** — dedupe the identical
      `matchMedia` check in `ThreadView.tsx` and `OnboardingTour.tsx`.
- [x] **9. Command palette IA gap** (UI-NFR4 names "start a handoff"/"generate a
      continuity report" as primary actions the palette must reach — neither
      existed by name) — relabel `tab-handoff` → "Start a handoff", `tab-profile`
      → "Run a profile", add a new "Generate a continuity report" entry routing to
      the same real Profile tab. No fabricated capability, routes to existing tabs only.
- [x] **10. Align InstructionsPreview's overwrite-gate vocabulary with
      DriftWrite's** — same "Drift review" heading/icon, "has drifted from the
      projection" wording instead of "already exists on disk and differs". Copy/
      header only — the invalidation-on-input-change state logic in both
      components is untouched (this exact pair has been the site of two real
      honesty-gate bugs per lessons.md; audit explicitly flagged full mechanical
      unification as needs-care, so doing the safe subset only).

- [x] **11. (Found during visual verification, not in the original audit) Command
      palette wasn't actually centered as a modal** — `.palette` relied on being a
      flex child of `.palette-overlay` for centering, but Radix renders
      `Dialog.Overlay`/`Dialog.Content` as portal *siblings*, not parent/child, so
      it fell into normal document flow at the end of `<body>` instead of
      appearing as a centered dialog. Fixed by self-positioning `.palette`
      (`position: fixed; top: 14vh; left: 50%; transform: translateX(-50%)`),
      the same pattern `.doctor-modal` already used correctly. `DoctorPanel` and
      `OnboardingTour` were checked and don't have this bug (both already
      self-position their content). Caught only by an actual rendered screenshot
      — typecheck/build/test all stayed green throughout since none of them
      render layout.

Verified 2026-07-03: `npm run typecheck && npm run build && npm test` (39/39)
green after every batch. Visual pass via headless Chromium (cached
`~/Library/Caches/ms-playwright/chromium-1208` + npx-cached Playwright package,
per the existing lessons.md recipe) against `npm run dev` — confirmed the
elevated honesty callout, the relabeled+new palette commands, the grouped header
buttons, and the ServerEditor empty state all render as intended, and caught +
fixed finding #11 above.

Deliberately NOT touched: OnboardingTour/OnboardingCard sequential-retelling
overlap (audit found no bug, just redundant teaching — not worth the risk of
touching hardened tour code for a non-bug) and full DriftWrite/InstructionsPreview
mechanical unification (flagged high-risk by the audit; item 10 above is the safe slice).

## v1.5 — full smoothness audit + library-research-driven rework (2026-07-06)

Goal (operator, via /goal): "fully audit and rework entire product to make it
feel smooth and thought out by researching many react libraries to do so."
Frontend-only; 🔴 contract untouched; honesty gates never weakened (CLAUDE.md).
Standing constraints: disk-tight (small deps only), keep hand-authored Icon
set, root `MotionConfig reducedMotion="user"`, verify per batch with
`npm run typecheck && npm run build && npm test` + headless-Chromium visual pass.

- [x] **R. Library research** — 3 parallel research agents (overlay/input
      primitives; motion/animation; chat-stream + feedback UX), web-sourced
      mid-2026 facts (npm downloads, releases, bundlephobia). Decision table:

      | Library | Verdict | Why |
      |---|---|---|
      | use-stick-to-bottom 1.1.6 | **ADOPT** (only new dep, ~5.7kB gz, zero-dep) | Exact fit for the streaming-thread scroll problem; solves the hard 30% (user-scroll vs programmatic-scroll disambiguation without debounce, ResizeObserver re-pin, scroll anchoring) a hand-rolled sentinel gets wrong; powers shadcn.io AI Conversation |
      | cmdk | REJECT (frozen ~12mo; palette already APG-correct) — port its ~40-line `command-score` ranking instead | revisit if commands need groups/pages/virtualization |
      | kbar | REJECT | perma-beta, bundles its own animator + fuse.js — duplicates framer-motion |
      | vaul | REJECT | mobile bottom-sheet idiom; no surface in a 4-tab desktop app |
      | more Radix primitives / unified `radix-ui` pkg | REJECT for now | hand-rolled radio/disclosure already APG-correct + tested; unified pkg installs all ~47 primitives (disk); switch at 5+ primitives |
      | Base UI (@base-ui/react) | REJECT here | the designated Radix successor (shadcn default for new projects) but never mix portal/focus systems; migrate wholesale only if Radix blocks us |
      | `motion` rename (framer-motion→motion/react) | STAY | same 12.42.2 code published in lockstep, zero breaking changes — rename opportunistically, not as churn |
      | @formkit/auto-animate | REJECT | strict subset of framer's `layout` prop already in the bundle |
      | number-flow | REJECT | odometer-spinning a confidence figure is exactly the gamified treatment NFR2 forbids |
      | sonner | REJECT — keep hand-rolled toasts | a11y core already right; port its 2 real wins by hand (pause-on-hover WCAG 2.2.1, stack cap) |
      | virtua / react-virtuoso / tanstack-virtual | REJECT (premature) | hundreds of bubbles ≠ virtualization scale; use CSS `content-visibility` instead; virtualization×streaming×stick-to-bottom is the most bug-prone chat combo |
      | react-hotkeys-hook | REJECT | ~6 shortcuts, guard already written; robustness tweaks by hand |
      | View Transitions API | REJECT | parallel animation system that ignores MotionConfig reducedMotion; React 18 needs flushSync hacks |

      Motion strategy (zero new deps): layoutId sliding tab pill (spring 380/32);
      asymmetric fade-through on tab panels (exit 0.08s easeIn → enter 0.18s easeOut,
      y:4); AnimatePresence popLayout on toasts + mutable lists (servers, bindings,
      gap-fills); motion tokens codified in src/state/motion.ts (SPRING_SNAPPY
      500/40, SPRING_SETTLE visualDuration .3 bounce .15, FADE .15 easeOut);
      staggered card entrance ≤300ms total on Profile/Doctor results; tighten CSS
      --transition-spring 500ms/1.56-overshoot → 300ms/1.3; height-auto reveals on
      NON-GATE expanders only; scaleX ceiling meter (state color never animates);
      message entrance y:6/0.15s; never animate token deltas or gate mount/unmount.
- [x] **A. Product audit** — 2 read-only agents (32 motion/smoothness findings
      incl. 3 root causes: card-entry `both` fill overriding framer exits +
      replaying per tab visit; the tab-switch wrapper breaking the flex chain
      so .thread never scrolled internally; active tab/seg growing 1px on
      select — plus 28 flow findings incl. 5 P1: handoff draft destroyed on
      tab switch, cwd/agent never persisted, unreachable agentsMd entity,
      Esc-in-Doctor cancelling live turns, 2 silent stream failure paths) +
      my own rendered-screenshot pass (raw invoke TypeErrors leaking into UI;
      BOTH "centered" modals actually rendering 25vw right of center — framer
      inline transform / keyframe `both` fill kill translateX(-50%) centering).
- [x] **B. Rework batches** — B1..B7, one commit each, full gate per batch
      (`249f338`…`0600b35`):
      B1 motion foundation (shared tokens in state/motion.ts, layoutId tab
      pill, asymmetric fade-through, box-model modal centering fix, spring
      token tighten); B2 five P1 flow fixes (handoff draft persistence, cwd/
      agent persistence, Esc guard, prompt/resolve failure paths, AGENTS.md
      editor); B3 thread UX (use-stick-to-bottom — the ONE adopted dep — jump
      chip, turn-boundary live region, mount-only bubble entrances, agent-
      attributed bubbles, diff-hunk 40vh cap, honest paused reasons); B4
      feedback (toast pause-on-hover/cap/popLayout, tauriInvoke no-backend
      mapping, error-kind write failures, pending states for switch/validate/
      import, animated banner + header notes + list reflow); B5 gate grammar
      (DriftWrite auto-compare + drifted→explicit-ack — strictly stronger,
      verdict above actions; InstructionsPreview stale-projection gate reset
      [new bug found while there] + scroll-to-gate; import wizard no longer
      clobbers canonical instructions; disconnect keeps the transcript); B6
      consistency (ranked palette + disabled-with-reason commands + new
      commands, agentLabel everywhere, secret-binding remediation, profile
      import validate-all-then-report, seed honesty + auto recentEdits,
      configTarget persistence); B7 loading (stale-preview reset on target
      switch, reserved preview/badge/doctor space, result stagger, mono font
      honesty). Concurrent parallel-session additions (AgentLogo marks,
      agent-drafted snapshots, token estimates) gate-verified + landed in B6.
- [x] **V. Verify** — headless-Chromium passes per batch (palette center
      x=720, pill tracking, tour targets, palette ranking, blocked reasons,
      friendly engine-unreachable banner) + full-tab screenshot pass + tour
      smoke (welcome step targetless by design, Enter advances to a real
      highlight); adversarial self-review agent run over 343b083..HEAD
      (findings + fixes recorded in the commit that follows it); final gate
      typecheck + build + 66/66 vitest. Two new lessons recorded (dual-stack
      stale dev server; transform-based centering vs framer/keyframe fills).
      NOT exercisable in the browser harness (no Tauri IPC): live stream
      pin/jump-chip behavior, real drift write flow, handoff switch —
      operator-verifiable via `npm run tauri dev`.

## v1.6 — goal batch: color picker, agent-drafted handoff, token honesty, agent logos (2026-07-06)

Goal (operator, via /goal): "add a color picker; app should be able to type in
terminal and prompt claude code or cursor itself to get the data it needs; app
should be upfront about how much tokens it may use; app logos should be there."
All frontend-only; 🔴 contract untouched; honesty gates never weakened. The
"prompt the agent itself" transport already exists (`stream.promptCapture`, used
by the profile run) — the gap is a *visible general use*: the handoff snapshot
is the most hand-typed surface in the app, so the app now asks the outgoing
agent to draft it. Verify per batch: `npm run typecheck && npm run build &&
npm test` + headless-Chromium visual pass.

- [x] **G1. Color picker (custom accent).** `theme.ts` grows pure derivation
      (`normalizeHex`/`hexToRgb`, darken/lighten mixes, hue-rotated secondary →
      `deriveAccent(hex): Accent`); accent persisted as preset-name-or-hex
      string (backwards compatible with stored "emerald"). `AccentSwitcher`
      keeps the 3 radio dots and adds a native `<input type="color">` custom
      swatch. Unit tests on the derivation (theme.test.ts). Real-browser
      verified: pick sets `--theme-primary` #e11d48 + derived secondary
      #e1751d, persists as hex, survives reload, ring marks the active swatch,
      presets switch back.
- [x] **G2. Agent-drafted snapshot.** `handoff/draftFromAgent.ts`: strict
      draft prompt + `parseSnapshotDraft` boundary parser (closed status enum,
      type-guarded fields, caps; null on no-JSON — same at-the-boundary
      discipline as validate_profile; invalid entries dropped, never coerced).
      HandoffPanel gets "Draft with {source}" → upfront token-cost confirm →
      `promptCapture` → fills the SAME editable fields (user still reviews;
      carry-diff ack untouched). Table tests on the parser
      (draftFromAgent.test.ts). Live-session flow is Tauri-gated → operator
      click-through via `npm run tauri dev`.
- [x] **G3. Upfront token estimates.** `state/tokenEstimate.ts` (~4 chars/token
      heuristic; every surface shares the same TOKEN_ESTIMATE_NOTE framing —
      an estimate, never a billed number). Shown: PromptInput live line,
      ProfileCollector pre-run line (plus the honest note that in-session
      history reading costs more on the agent's side), HandoffPanel draft
      confirm, CarryDiff brief-send line. Unit tests (tokenEstimate.test.ts).
- [x] **G4. Agent logos.** `AgentLogo.tsx`: hand-authored inline-SVG marks
      (CLAUDE.md rule: no icon library, no emoji; original geometry evoking
      each agent, not vendor trademark copies) keyed by registry id
      (claude/codex/cursor) with a generic fallback — display metadata like
      displayName, not a behavior branch (M2 win condition holds). Used in
      AgentPicker status chips, assistant bubble attribution, and the Handoff
      "Carrying from" line.

Landed in commit `1752625` (B6) — built in this session concurrently with the
v1.5 B-batch session on the same working tree; that session's B6 commit swept
in and gate-verified both work streams together (typecheck + build + 66/66
tests green; its message documents the co-landing). Visual pass re-run after
B6 against the live dev server (pid ownership + served-source freshness
checked per lessons 2026-07-06).

## Cross-cutting (build once, never delete)
- Golden-config fixtures (real `.mcp.json` / `config.toml` / `.cursor/mcp.json`) — build at M3.
- JSON Schema on every Profile Skill output — validate + reject at the boundary (M5b).
- Live smoke script already exists (`tests-e2e/smoke.sh`).

## Notes / decisions made autonomously
- Canonical store: SQLite + files was an open question → starting **files/in-memory model only** (no DB yet); the model is DB-agnostic so SQLite can wrap it later. Pure-function engine doesn't need persistence to be correct/tested.
- Secrets: canonical `ConfigValue::Secret` holds only a *reference* (env var / keychain), never a literal — strongest possible "no inlined token" guarantee (the literal never enters the model).

## v1.7 — stub/gap audit (2026-07-06)

3-agent parallel audit (repo-wide stub grep + core-PRD FR24-50 vs code + UI-PRD
UI-FR1-34 vs code), read-only, no fixes applied yet. Full findings below; ranked
worst-first.

### 🔴 P0 — real bug, not a doc gap
- [x] **`cancel()` is a no-op in the real ACP host.** FIXED (2026-07-06). Test-first
      ritual: added `cancel_stops_an_in_flight_turn_via_real_notification` to
      `offline_transport.rs` (fake-agent races the pending permission decision
      against a `session/cancel` notification), watched it fail, then fixed
      `host.rs`: `run_turn` now `tokio::select!`s between `session.read_update()`
      and the command channel, so a `Cancel` mid-turn sends a real ACP
      `CancelNotification` immediately instead of waiting for the turn to end on
      its own. Fixing this surfaced a SECOND, deeper pre-existing bug the test
      first exposed: the client's `RequestPermissionRequest` handler awaited
      `handle_permission` inline inside the SDK's dispatch loop, which (per
      `agent_client_protocol`'s own `ordering` docs) blocks ALL further incoming
      messages — including the agent's eventual `Cancelled` response — until the
      handler returns. Since a pending edit awaits a real user click (seconds to
      minutes), any cancel sent while an edit was pending was structurally
      undeliverable no matter what `host.rs`'s command loop did. Fixed by
      `cx.spawn`-ing `handle_permission` instead of awaiting it inline (mirrors
      the pattern `fake_agent.rs`'s own agent-side handler already used).
      Frontend: `useAgentStream.ts` no longer optimistically sets
      `turnActive=false` in `cancel()` — the real `TurnEnded` does it. Added a
      new `turnDisownedRef` (NOT a reuse of `epochRef` — that value is baked
      into a session's event channel at connect-time forever, so bumping it on
      cancel would also silently drop every later turn's events in the *same*
      still-open session, a real regression this fix avoids) that suppresses
      stray textDelta/thought after cancel, auto-rejects (rather than silently
      dropping) any editHunk that arrives after cancel to avoid hanging the
      agent's dispatch loop waiting for a decision, and rejects an in-flight
      `promptCapture` instead of resolving it with a truncated buffer. Verified:
      `cargo test --workspace` + `cargo clippy --workspace --all-targets` +
      `npm run typecheck && npm run build && npm test` (66/66) all green.

### v1-committed PRD FRs never built
- [ ] **FR25 auto-reproject on change.** Zero file-watcher code anywhere
      (`notify`/`watcher`/`watch(` greps all empty). Canonical edits only take
      effect on a manual revisit-and-click-Apply.
- [ ] **FR40 deep-scan option.** `src/components/profile/profileRun.ts` has one
      fixed `PROFILE_PROMPT`; no depth/window parameter exists.
- [ ] **FR41 dismiss/curate friction patterns.** `frictionPoints` typed
      `unknown[]` in `src/engineTypes.ts`, never rendered in any profile
      component — no dismiss action can exist because nothing displays them.
- [ ] **FR50 signed cross-platform packaging.** `.github/workflows/desktop-build.yml`
      states outright "unsigned dev builds"; no signing/notarize block in
      `tauri.conf.json` (tracked already in `operator-todo.md`).
- [ ] **FR31 permission presets** — 2 of 3 named tiers shipped (`default`/
      `acceptEdits`, no `bypass`) — deliberate, documented (frozen `AgentEvent`
      has only one permission-shaped variant), just noting it's a PRD-vs-build gap.
- [ ] **FR47 auth status panel** — status itself is real, but no "one-click
      open-native-login" action exists anywhere (`open.*login` greps empty) —
      PRD text promises it, UI only shows a tooltip pointing at the CLI.
- [ ] **FR48 onboarding wizard** — doesn't itself detect installed agents (that
      check lives only in the separate, unlinked Doctor panel); no dedicated
      secret-binding step.

### Stub wearing a real UI
- [ ] **Gap-filling "marketplace" index is 2 hardcoded entries**
      (`crates/profile/src/gapfill.rs` `capability_index()`), one of which
      points at the product's own GitHub repo. Not a real third-party index.
      The honesty mechanism around it (source-before-install, equivalence tag,
      no auto-install) is genuinely implemented — there's just nothing to browse.
      Expected to stay this way until FR44 (v1.1, marketplace index) is scoped.

### Undocumented UI gaps (found by the UI-FR pass, not previously in todo.md)
- [x] **UI-FR06 — non-diff permission requests silently hang.** FIXED (2026-07-06).
      Added `AgentEvent::PermissionRequest { session, request_id, description }` —
      the frozen contract's second permission-shaped variant, alongside `EditHunk`.
      `translate::permission_description` builds a human-readable description
      (the tool call's own `title`, else its `kind`, else a generic fallback —
      never empty); `host.rs`'s `handle_permission` now emits exactly one of
      `EditHunk`/`PermissionRequest` for every permission ask, never neither.
      Frontend: new `PendingPermission` type, `pendingPermission` state,
      `resolvePermissionRequest` action, and a `PermissionAsk.tsx` component
      (reuses `DiffHunk`'s chrome). Deliberately NOT auto-resolved by the FR31
      "acceptEdits" preset — that preset's scope stays "file edits only";
      widening it to arbitrary non-diff actions (e.g. shell commands) would be
      a real security-relevant behavior change, not a naming detail. New
      offline test `non_diff_permission_surfaces_and_resolves` (fake_agent gains
      `FAKE_AGENT_NONDIFF_PERMISSION`) proves the ask surfaces and resolves
      instead of hanging. Verified: `cargo test --workspace` + `cargo clippy
      --workspace --all-targets` + `npm run typecheck && npm run build && npm
      test` (70/70) all green.
- [x] **UI-FR08 — carry-diff gate has a bypass.** FIXED (2026-07-06). The header
      `AgentPicker`'s Disconnect+reconnect changed the active agent directly,
      skipping the Handoff panel's carry-diff entirely. Deliberately NOT
      hard-blocked — Disconnect is itself an honest, standalone action (it
      already says plainly the session ended) and forcing every disconnect
      through Handoff would be real overreach for a legitimate "just start
      fresh" click. Instead: `AgentPicker` now nudges (a `callout-honesty`
      inline note, not a modal) only when there's an actual conversation
      (`hasConversation`) AND an actual alternative agent to switch to
      (`agents.length > 1`) — "Go to Handoff" (switches tab, keeps the session
      live so its carry-diff can still be built) / "Disconnect anyway" /
      "Cancel". New `callout-actions` CSS class (forces the button row onto
      its own line via the honesty variant's existing flex-wrap). Not
      exercisable in the plain browser harness — gated behind a real
      `connected` session (live IPC), same caveat as other Tauri-gated
      surfaces; operator-verifiable via `npm run tauri dev`. Verified:
      `npm run typecheck && npm run build && npm test` (70/70) green.
- [ ] **`OnboardingTour.tsx` mislabeled + contradicts its own spec.** PRD reuses
      "UI-FR28" for two different requirements (§6 linear wizard vs §11 addendum
      inline checklist); the Tour's own comments claim UI-FR28 but it satisfies
      neither — it's a blocking Radix modal (`onInteractOutside` → `preventDefault`),
      contradicting the addendum's "never a modal wall," and never calls the
      wizard's real commands (no `preview_mcp`/`audit_secret_bindings`/
      `start_session`/`validate_profile`) — it only narrates + spotlights DOM.
      `OnboardingCard.tsx` is the one that actually matches the addendum.

### Confirmed non-issues (already tracked/deferred correctly — no action)
- FR29 canonical-store export/backup: unbuilt, but that's v1.1 as tagged; not
  to be confused with UI-FR33 profile export (real, already shipped).
- FR44 marketplace index breadth: v1.1, correctly unbuilt (see stub note above).
- Everything else in the repo-wide grep (TODO/FIXME/todo!()/mock data/empty
  catches/`as any`) came back clean — this codebase is unusually disciplined
  outside the one host.rs finding above.
