# Agent Bridge — Client Surface (UI/UX) PRD

**Status:** Draft v1
**Owner:** K, Cognifer Labs
**Last updated:** June 2026
**Companion docs:** `agent-bridge-prd.md` (core product, FR1–FR50); `agent-bridge-plan.md` (architecture, two-engine model, milestones M1–M7).

This is a **standalone** PRD: it specifies the frontend client surface that consumes Agent Bridge's already-wired engine IPC (the 15 Tauri commands), and it is the **post-M7 UI milestone**.

---

## 1. Summary

This is the **Client Surface (UI/UX) PRD** for Agent Bridge — the standalone specification for the frontend that a developer actually touches. The Rust core is done: the ACP host, Projection Engine, Handoff Bridge, Profile layer, and Secrets store are built, tested, and exposed through exactly **15 wired Tauri IPC commands**. What does not yet exist as product is the *surface* that lets a single developer see and drive those engines — the panels that consume `preview_mcp`, `check_drift`, `build_handoff_brief`, `merge_profiles`, `gap_fills_for`, and the rest.

The purpose of this document is to specify that surface: **4–5 new frontend panels plus the polish pass on the existing thread/diff shell**, and nothing behind the IPC boundary. Every requirement here resolves to a React/TS component that calls one or more of the 15 existing commands through the two IPC chokepoints (`src/ipc.ts` for runtime, `src/engines.ts` for engines). No requirement in this PRD adds a backend command, changes an engine's behavior, or invents a capability the core does not already provide.

The reason this surface is worth its own PRD is that Agent Bridge's whole value proposition is an **honesty contract** (NFR2): memory is *bridged, not migrated*; instructions are *equivalent, not identical*; profile confidence is shown *per agent*; secrets are *references, not literals*; generated configs are *previewed, not clobbered*. Those distinctions are invisible in the engines — they live or die entirely in the UI. A panel that renders a handoff brief as "continuing your session," or a config write as a silent success, would ship a *lie* on top of a correct engine. So the client surface is not decoration over a finished product; it is the layer where the product's core promise is either kept or broken. This PRD treats every honesty affordance as a hard functional requirement, not a nicety.

---

## 2. Audience

- **Primary: the solo builder implementing and diff-reviewing the frontend.** One developer directing coding agents to write React/TS, then reviewing the diffs (NFR6). This PRD is written to be read alongside the diff: each requirement names the component it lives in and the IPC command it calls, so a reviewer can check "does this panel actually surface `fidelityNote`?" against a concrete line, not a vibe. All frontend work here is 🟢/🟡 by the trust-zone model — verifiable by rendering real engine output — because the 🔴 transport core is already frozen behind its integration test; **this PRD must not motivate any change to that core.**
- **Secondary: reviewers checking the honesty contract.** Anyone auditing whether the shipped UI honors NFR2 — that no panel implies more seamlessness than the engine delivers. This document gives them the checklist.
- **Out of audience:** end-user documentation, marketing, and anyone evaluating the engine logic itself — that is the core PRD's and the plan's territory, not this one.

---

## 3. Scope & non-goals

### In scope

1. **Polish the existing thread/diff shell.** The runtime shell already renders one unified `AgentEvent` model (`textDelta`, `thought`, `editHunk`, `turnEnded`, `error`) identically for all agents, with per-hunk accept/reject. In scope: hardening and finishing `App.tsx`, `AgentPicker.tsx`, `ThreadView.tsx`, `MessageBubble.tsx`, `DiffHunk.tsx`, and `PromptInput.tsx` — streaming/thought rendering, permission prompts (`resolve_permission`), cancel (`cancel`), and per-agent auth state — **while preserving the zero-per-agent-branch invariant** (agent is chosen purely by registry id).
2. **Projection / Config panel** — consumes `preview_mcp`, `check_drift`, `preview_instructions`, `audit_secret_bindings`. Previews native configs as diffs before write, shows drift status, surfaces the Cursor tool-count warning, and lists secret bindings as `${VAR}` + resolvability.
3. **Handoff panel** — consumes `build_handoff_brief`. Shows the pre-switch carry diff (what will/won't carry) and renders the returned brief explicitly labeled as a reconstructed brief.
4. **Profile panel** — consumes `validate_profile`, `merge_profiles`, `recommend_features`. Orchestrates running the Profile Skill *inside* each agent via `start_session` + `send_prompt`, validates the emitted JSON at the boundary, merges, and shows **per-agent confidence**.
5. **Continuity / Gap-Fill panel** — consumes `workflow_continuity` and `gap_fills_for`. Renders the four-bucket continuity report and gap-fillers marked *equivalent vs approximation*, with marketplace source shown before install and generated skills shown as reviewable diffs.

(4 new panels + the shell polish; the Profile and Continuity/Gap-Fill panels may split into 5 if the profile-run orchestration warrants its own surface.)

### Non-goals

- **Re-implementing or modifying engine logic.** No new IPC command, no changed engine semantics, no bypassing `src/ipc.ts` / `src/engines.ts`. If a panel seems to need a capability the 15 commands don't offer, that is a gap to flag, not to build around.
- **Touching the frozen 🔴 transport core** (ACP host spawn/JSON-RPC/streaming). This PRD is a consumer of its events only.
- **Mobile / responsive-for-touch.** Desktop (Tauri webview) only.
- **Business, pricing, packaging, and go-to-market.** Signed cross-platform packaging (core FR50) and any monetization are explicitly outside this surface.
- **Aggregate/comparative or third-party-marketplace features** deferred to v2 in the core PRD (FR45, FR46) — not part of this milestone.

---

## 4. Relationship to core PRD & plan

This document is the **post-M7 UI milestone**. It is a companion to `agent-bridge-prd.md` (core product, FR1–FR50) and `agent-bridge-plan.md` (architecture, two-engine model, M1–M7). Those documents specify *what the engines do and why*; this one specifies *the client surface that gives those capabilities a place to be seen and driven*. To avoid numbering collisions, this PRD's own requirements use the prefix **UI-FRn**; the table below maps existing core FRs to the UI home this PRD gives them.

Every mapping resolves to one of the 15 wired IPC commands or to an already-built shell component — there are no orphan rows requiring new backend work.

| UI home (this PRD) | Core FRs it gives a surface | IPC command(s) / component(s) consumed |
|---|---|---|
| **Thread/diff shell (polish)** | FR2 (one thread UI), FR3 (per-hunk accept/reject), FR4 (permission modes, no auto-grant destructive), FR1 (agent spawn, surfaced) | `list_agents`, `start_session`, `send_prompt`, `resolve_permission`, `cancel`; `ThreadView`, `MessageBubble`, `DiffHunk`, `PromptInput`, `AgentPicker` |
| **Projection / Config panel** | FR7 (MCP projection ×3), FR9 (instructions, equivalent-not-identical), FR10 (Cursor ~40-tool ceiling + cumulative count), FR11 (drift flag not clobber), FR12 (secrets as references), FR24 (dry-run diff before write), FR26 (import wizard), FR27 (secret-binding manager) | `preview_mcp`, `check_drift`, `preview_instructions`, `audit_secret_bindings` |
| **Handoff panel** | FR5 (one-control switch, show carry first), FR13–FR14 (capture + re-inject snapshot), FR15 (label as brief not continued session), FR36 (pre-switch carry diff) | `build_handoff_brief` (+ `start_session`/`send_prompt` to open the incoming turn) |
| **Profile panel** | FR16–FR18 (Profile Skill runs natively per agent), FR19 (confidence-weighted merge, per-agent confidence), FR20/FR20a (local-first; characterization + per-trait recommendations) | Skill run via `start_session` + `send_prompt`, then `validate_profile`, `merge_profiles`, `recommend_features` |
| **Continuity / Gap-Fill panel** | FR21 (four-bucket continuity report), FR22/FR22a (gap-filling with skills), FR22b (equivalent vs approximation; source before install; generated skills as reviewable diffs), FR42 (generated-skill review queue) | `workflow_continuity`, `gap_fills_for` |
| **Auth state (in shell + config panel)** | FR23 / FR47 (per-agent connected / needs-login / error) | per-agent `AuthStatus` surfaced through `list_agents` / session state |

**Cross-cutting constraint that binds all rows — NFR2, the honesty contract.** This PRD elevates NFR2 from a principle to per-panel acceptance criteria: the Handoff panel must render `render_brief()` output as a reconstructed brief (never "resumed"); the Config panel must surface `preview_instructions.equivalentNotIdentical` / `fidelityNote` and show generated configs as diffs (generate-only, drift-flagged, never silent-clobbered) with secrets as `${VAR}` placeholders + resolvability from `audit_secret_bindings` (never a literal token); the Profile panel must show confidence **per agent** so thin history is visible; and the Gap-Fill panel must mark each filler *equivalent* vs *approximation* and show marketplace source before any install. NFR1 (local-first: no transcript/source upload; only aggregate profile JSON) is honored structurally by staying within these 15 commands, none of which exfiltrate raw data.

Core FRs deliberately **not** given a UI home in this milestone: FR25 (auto-reproject watcher), FR28–FR29, FR33–FR35, FR37–FR39, FR43–FR46, FR49–FR50 — either v1.1+/v2 scope or non-goals (packaging, comparative/marketplace). They are noted here so their absence is a recorded decision, not an oversight.

---

## 5. User stories & flows

This section describes the primary end-to-end journeys across the five client surfaces. Each story is grounded in the honesty-by-design constraints (NFR2) and references **only** the 15 wired Tauri IPC commands. Where a step performs a local, client-side action (assembling a snapshot, accepting a hunk, confirming a file write), it is called out as UI-orchestrated rather than a backend call — the frontend never invents new backend commands. Each story names the functional requirements (§6) it realizes.

> **Wired command legend** — Runtime: `list_agents`, `start_session`, `send_prompt`, `resolve_permission`, `cancel`. Engines: `preview_mcp`, `check_drift`, `preview_instructions`, `build_handoff_brief`, `validate_profile`, `merge_profiles`, `recommend_features`, `workflow_continuity`, `gap_fills_for`, `audit_secret_bindings`.

### (a) Run loop — driving any agent through the unified thread/diff surface

**US-A1 — Unified run loop.** *(realizes UI-FR1–UI-FR7)*
*As a developer, I want to pick any of the three agents and drive it through one thread + diff surface, so that I get identical text, tool-call, and per-hunk accept/reject rendering regardless of which agent is running underneath.*

1. On launch, the shell calls `list_agents` to populate the AgentPicker with each registered agent and its `AuthStatus` (`connected | needsLogin | error`).
2. The developer selects an agent (by registry id only — no per-agent UI branch) and a working directory, then calls `start_session` to spawn that agent over ACP.
3. The developer types a prompt in PromptInput; the UI calls `send_prompt`, and ThreadView renders the streamed `AgentEvent` sequence (`textDelta`, `thought`, `editHunk`, `turnEnded`, `error`) through the same MessageBubble/DiffHunk components for every agent.
4. When an `editHunk` arrives, DiffHunk shows a per-hunk accept/reject control; the developer accepts or rejects each hunk individually (client-side over the ACP stream).
5. If the agent requests a permission (e.g. a tool call needing consent), the UI surfaces the request and the developer answers via `resolve_permission`.
6. At any point the developer can abort the in-flight turn with `cancel`; the thread shows the turn as cancelled rather than silently stopping.
7. On `turnEnded`, the thread settles and PromptInput re-enables for the next prompt.

### (b) Canonical config — edit once, preview and write per-target native files with drift, tool-ceiling, and secret warnings

**US-B1 — Preview-before-write projection.** *(realizes UI-FR9–UI-FR15)*
*As a developer, I want to edit the canonical config once and preview exactly what each agent's native file will contain — with drift, tool-ceiling, and secret-binding warnings — before anything touches disk, so that generated files are honest artifacts I approve rather than silent overwrites.*

1. The developer edits canonical entities (McpServer list, Instructions, Skills, AGENTS.md) in the config surface — the canonical store is the only thing they edit directly.
2. For a chosen target, the UI calls `preview_mcp(target, servers)` and renders the returned `McpProjection.contents` as a read-only preview, surfacing `McpProjection.toolCount` and any `McpProjection.warnings` — including the Cursor ~40-tool ceiling warning — inline.
3. For instructions, the UI calls `preview_instructions(target, instructions)` and renders `InstructionArtifact.contents` at its `InstructionArtifact.path`, always displaying the `equivalentNotIdentical` flag and `fidelityNote` so the projection is labeled "equivalent, not identical" (NFR2.2).
4. The UI calls `audit_secret_bindings(servers)` and, for each `SecretBinding`, shows the `${VAR}`/keychain placeholder plus its `resolvable` and `fromKeychain` status — never a literal token value (NFR2.4).
5. The UI calls `check_drift(target, onDisk, servers)` and renders the `DriftStatus`: `Missing`, `InSync`, `Drifted{added, removed, changed}`, or `Unreadable`, so the developer sees how the on-disk file differs from what projection would generate.
6. The developer reviews the preview + drift diff and confirms the write as an explicit, per-target action (UI-orchestrated). The write itself is a Tauri filesystem write of the projection's returned `contents` to the target's native path — it happens **outside** the engine-IPC boundary, because none of the 15 commands writes to disk (`preview_mcp` / `preview_instructions` / `check_drift` only preview or compare). Files are generate-only: on `Drifted`, the UI presents the diff for review rather than clobbering, and re-runs `check_drift` afterward to confirm the target is now `InSync`.

### (c) Handoff Bridge — switching agents mid-task with an honest, reconstructed brief

**US-C1 — Honest mid-task handoff.** *(realizes UI-FR8, UI-FR16–UI-FR18)*
*As a developer switching from one agent to another mid-task, I want to review exactly what context will be carried and then hand off via a brief that openly states it is a reconstruction — not a resumed session — so the tool never pretends memory was migrated (NFR2.1).*

1. While a session is active, the developer triggers "switch agent." The UI assembles a `ContextSnapshot` client-side from the current session (`sourceAgent`, `targetAgent`, `workingDirectory`, `openFiles`, `taskList`, `recentEdits`, `decisions`, `conversationSummary`, `activeMcp`, `activeSkills`).
2. The UI shows a **pre-switch carry diff**: what is being carried into the brief versus what stays behind, so the developer can confirm or trim the snapshot before switching.
3. The UI calls `build_handoff_brief(snapshot)` and displays the returned brief string, which explicitly labels itself as a reconstructed brief, not a continued conversation.
4. The developer optionally `cancel`s the outgoing agent's in-flight turn to end it cleanly.
5. The UI calls `start_session` for the `targetAgent` in the same working directory.
6. The UI injects the brief as the incoming agent's opening turn via `send_prompt`; ThreadView renders it visibly framed as a "carrying a brief" handoff message, never as continued memory.
7. From here the developer continues in the standard run loop (flow a) on the new agent.

### (d) Vibe-Coder Profile — run the skill in-agent, validate, merge, and review recommendations, continuity, and gap-fills as diffs

**US-D1 — In-agent profile generation and validation.** *(realizes UI-FR19–UI-FR20, UI-FR26)*
*As a developer, I want to run the Profile Skill inside each agent's own session and have its JSON strictly validated at the boundary, so that a malformed or non-conforming profile is rejected rather than silently corrupting the merge.*

1. The developer starts (or reuses) a session on an agent with `start_session`, then runs the Profile Skill by sending its invoking prompt with `send_prompt` — the skill runs on that agent's own model and reads local history (there is no separate `run_profile` backend command; the UI orchestrates it through the session).
2. The UI captures the skill's emitted JSON from the `AgentEvent` stream and passes it to `validate_profile(json)`; a conforming result yields a `CoderProfile`, and a non-conforming one is rejected at the boundary with the reason shown to the developer.
3. The developer repeats steps 1–2 for the second and third agents to collect up to three per-agent `CoderProfile`s.

**US-D2 — Cross-agent merge and personalized outputs.** *(realizes UI-FR21–UI-FR25)*
*As a developer, I want the three profiles merged with visible per-agent confidence and then turned into personalized recommendations, a continuity report, and reviewable gap-fills, so that thin history is never hidden and every suggestion is honestly labeled.*

4. The UI calls `merge_profiles(profiles[])` and renders the `MergedProfile`, surfacing each agent's data-volume-based weight **and** absolute confidence per agent — thin history is shown, not smoothed over (NFR2.3).
5. The UI calls `recommend_features(profile)` and lists each `Recommendation{feature, because, evidence}`, showing the reasoning and evidence behind every suggestion.
6. For a chosen target, the UI calls `workflow_continuity(target, store, profile)` and renders the `ContinuityReport` in four honest buckets: `transfersAutomatically`, `needsSubstitute[]`, `addForParity[]`, and `genuinelyLost[]`.
7. The UI calls `gap_fills_for(target, profile)` and renders each `GapFill{capability, target, equivalence, motivation, resolution, profileSpecific}`, tagging every item `equivalent` vs `approximation` (NFR2.5).
8. For a `GapFill` whose `resolution` is `marketplace`, the UI shows the skill's source before any install and never auto-installs; for `generatedSkill` or `rule`, it presents the artifact as a reviewable diff alongside the motivating friction, which the developer approves before it is written (UI-orchestrated), consistent with the generate-only, preview-as-diff discipline in flow (b).

### (e) Auth status & onboarding — getting each agent connected

**US-E1 — Per-agent auth visibility.** *(realizes UI-FR27–UI-FR28)*
*As a first-time or returning developer, I want to see each agent's connection status up front and be guided through logging in the ones that need it, so I always know which agents are actually usable before I start a run.*

1. On startup and on demand, the UI calls `list_agents` and renders each agent's `AuthStatus` badge: `connected`, `needsLogin`, or `error`.
2. For a `connected` agent, the developer can proceed directly into the run loop (flow a).
3. For a `needsLogin` agent, onboarding walks the developer through that agent's native login; the UI then re-runs `list_agents` to confirm the status flipped to `connected`.
4. For an `error` agent, the UI surfaces the error state and blocks `start_session` for that agent until it clears, re-checking via `list_agents`.
5. Once at least one agent reports `connected`, onboarding hands off to flow (a) so the developer's first `start_session` + `send_prompt` succeeds, and optionally points to flow (b) to project their canonical config into the newly connected agents.

---

## 6. Functional requirements (UI-FRn)

All requirements below are **client-surface** requirements for the Agent Bridge frontend. They consume only the 15 already-wired Tauri IPC commands — no new backend capability is assumed. Each requirement names the exact command(s) it calls and cites the core PRD FR (`agent-bridge-prd.md`) it realizes. Requirements tagged **Honesty-by-design (NFR2)** are hard UX constraints: the UI must not imply more seamlessness than the engines actually deliver.

### 6.1 Unified Runtime Shell (thread / diff / permission / agent-switch)

- **UI-FR1. Agent picker.** List every connectable agent and select one purely by registry id, with zero per-agent UI branches. *Calls:* `list_agents`. *Realizes:* FR2, FR5.
- **UI-FR2. Session connect.** Start a session on the chosen agent for a given working directory. *Calls:* `start_session`. *Realizes:* FR1, FR2.
- **UI-FR3. Unified thread render.** Render the single `AgentEvent` stream (`textDelta`, `thought`, `editHunk`, `turnEnded`, `error`) identically for all three agents from the live session. *Calls:* consumes the `start_session` / `send_prompt` event stream. *Realizes:* FR2.
- **UI-FR4. Prompt input.** Submit a user turn to the active session. *Calls:* `send_prompt`. *Realizes:* FR2.
- **UI-FR5. Per-hunk accept/reject.** Accept or reject each `editHunk` individually before it is applied. *Client-side over the `editHunk` stream — no IPC command (the frontend tracks per-hunk state locally; there is no backend accept/reject call).* *Realizes:* FR3.
- **UI-FR6. Permission prompt surface.** Present ACP permission requests and require an explicit user decision; never auto-grant a destructive mode. *Calls:* `resolve_permission`. *Realizes:* FR4.
- **UI-FR7. Cancel in-flight turn.** Interrupt a running turn from the thread. *Calls:* `cancel`. *Realizes:* FR2.
- **UI-FR8. One-control agent switch.** Switch the active agent from a single control and, before committing, route the user through the Handoff panel's carry preview (UI-FR16). *Calls:* `list_agents`, `start_session`. *Realizes:* FR5.

### 6.2 Config & Projection panel (canonical editor, per-target preview/diff, drift, Cursor tool-ceiling, secret-binding manager)

- **UI-FR9. Canonical editor.** Edit the canonical entities (`McpServer`, `Skill`, `Instructions`, `AGENTS.md`) as the single source of truth; native config files are never edited directly in the UI (generate-only). The editor's output is the `servers` / `instructions` / `store` input to every preview command below. *Calls:* feeds `preview_mcp`, `preview_instructions`, `check_drift`, `audit_secret_bindings`. *Realizes:* FR6.
- **UI-FR10. Per-target MCP projection preview.** Show the projected MCP config for each target (Claude JSON, Cursor JSON, Codex TOML) as a preview diff against the current on-disk file. *Calls:* `preview_mcp(target, servers)` → `McpProjection{contents,toolCount,warnings}`. *Realizes:* FR7, FR24.
- **UI-FR11. Cursor tool-ceiling warning.** Surface the cumulative tool count per target and warn before a projection exceeds Cursor's ~40-tool ceiling. *Calls:* `preview_mcp` (`toolCount`, `warnings`). *Realizes:* FR10.
- **UI-FR12. Instructions projection preview — equivalent, not identical.** Preview the projected instructions doc (`CLAUDE.md` / `AGENTS.md` / `.cursorrules`) and display the `equivalentNotIdentical` flag and `fidelityNote` prominently on every instructions target. *Calls:* `preview_instructions(target, instructions)` → `InstructionArtifact{path,contents,equivalentNotIdentical,fidelityNote}`. *Realizes:* FR9. *Honesty-by-design (NFR2):* instructions are labeled equivalent, never presented as identical.
- **UI-FR13. Drift detection display.** Show per-target drift status (`Missing` / `InSync` / `Drifted{added,removed,changed}` / `Unreadable`) and flag out-of-band hand-edits rather than silently overwriting them. *Calls:* `check_drift(target, onDisk, servers)` → `DriftStatus`. *Realizes:* FR11.
- **UI-FR14. Dry-run diff before every write.** Never write a native file silently: present the projected output as a reviewable diff against the on-disk file, gated by drift status, before any generation is committed. (The commit itself is a Tauri-fs write of the returned `contents`, outside the 15-command engine boundary.) *Calls:* `preview_mcp`, `preview_instructions`, `check_drift`. *Realizes:* FR6, FR24. *Honesty-by-design (NFR2):* configs are generate-only and drift-flagged, never clobbered.
- **UI-FR15. Secret-binding manager.** List every `SecretRef` across all servers, render each as a `${VAR}` placeholder, and show whether it resolves (env var present / keychain entry exists) — never a literal token value. *Calls:* `audit_secret_bindings(servers)` → `SecretBinding[]`. *Realizes:* FR12, FR27. *Honesty-by-design (NFR2):* secrets are shown as references with resolvability, never as inlined literals.

### 6.3 Handoff panel (pre-switch carry diff, honest brief, re-injection)

- **UI-FR16. Pre-switch carry diff.** Before an agent switch commits, assemble the `ContextSnapshot` (`workingDirectory`, `openFiles`, `taskList`, `recentEdits`, `decisions`, `conversationSummary`, `activeMcp`, `activeSkills`) and show exactly what will and won't carry, previewing the resulting brief. *Calls:* `build_handoff_brief(snapshot)` → `string`. *Realizes:* FR13, FR36.
- **UI-FR17. Honest brief label.** Render the handoff opening turn as an explicitly reconstructed brief — the UI states "carrying a brief," never implying a continued or migrated session. *Calls:* `build_handoff_brief(snapshot)` → `string`. *Realizes:* FR15. *Honesty-by-design (NFR2):* memory is bridged, not migrated.
- **UI-FR18. Brief re-injection.** Send the reconstructed brief as the incoming agent's opening turn on the new session. *Calls:* `start_session`, `send_prompt`. *Realizes:* FR14.

### 6.4 Profile & Continuity dashboard (run-via-session, validate, merge, per-agent confidence, personalization, recommendations, continuity report, gap-fill review)

- **UI-FR19. Run profile via agent session.** Orchestrate the Profile Skill inside each agent through a normal session — there is no `run_profile` command — and capture the emitted `CoderProfile` JSON. *Calls:* `start_session`, `send_prompt`. *Realizes:* FR16, FR17.
- **UI-FR20. Boundary validation.** Validate each agent's emitted JSON against the strict `CoderProfile` schema and reject non-conforming output at the boundary before it can enter the merge. *Calls:* `validate_profile(json)` → `CoderProfile`. *Realizes:* FR17.
- **UI-FR21. Confidence-weighted merge with per-agent confidence.** Merge up to three per-agent profiles confidence-weighted by data volume, and surface both the per-agent weight and each agent's absolute confidence so thin history is visible. *Calls:* `merge_profiles(profiles[])` → `MergedProfile`. *Realizes:* FR19. *Honesty-by-design (NFR2):* profile confidence is shown per agent, never hidden or averaged away.
- **UI-FR22. Personalization view.** Present the merged profile as a characterization of the individual with evidence attached to each trait. *Calls:* `merge_profiles`, `recommend_features`. *Realizes:* FR18, FR20a.
- **UI-FR23. Feature recommendations.** Show per-person feature recommendations, each with its `because` rationale and `evidence`. *Calls:* `recommend_features(profile)` → `Recommendation[]`. *Realizes:* FR20a.
- **UI-FR24. Workflow Continuity Report.** For a chosen target agent, render the four sections: `transfersAutomatically`, `needsSubstitute[]`, `addForParity[]`, `genuinelyLost[]`. *Calls:* `workflow_continuity(target, store, profile)` → `ContinuityReport`. *Realizes:* FR21.
- **UI-FR25. Gap-fill review.** List each `GapFill{capability,target,equivalence,motivation,resolution,profileSpecific}`, mark it `equivalent` vs `approximation`, show a marketplace skill's source before any install (never auto-install), and present a generated skill as a reviewable diff alongside the friction pattern that motivated it. *Calls:* `gap_fills_for(target, profile)` → `GapFill[]`. *Realizes:* FR22a, FR22b, FR42. *Honesty-by-design (NFR2):* gap-fills are labeled equivalent vs approximation and nothing third-party is installed unreviewed.
- **UI-FR26. Local-first profiling.** Guarantee that only aggregate `CoderProfile` JSON leaves an agent session — no raw transcript or source is uploaded or implied to be uploaded; the run-via-session pipeline surfaces only validated aggregate output. *Calls:* `start_session`, `send_prompt`, `validate_profile` (no upload path exists). *Realizes:* FR20. *Honesty-by-design (NFR2 / NFR1):* local-first, aggregate-only, no transcript or source upload.

### 6.5 Auth & onboarding

- **UI-FR27. Per-agent auth status.** Display each agent's live status — `connected` / `needsLogin` / `error`. Since there is no auth/login command among the 15 (`list_agents` only *reports* `AuthStatus`), guide the user out to the agent's own external native login, then re-poll `list_agents` to confirm the status flipped — the app never drives the login itself. *Calls:* `list_agents`. *Realizes:* FR23, FR47.
- **UI-FR28. Onboarding wizard.** Walk first-run setup: detect installed agents, preview importing their configs, bind secrets, and run the first profile — reusing the same commands as the steady-state panels. *Calls:* `list_agents`, `preview_mcp`, `preview_instructions`, `check_drift`, `audit_secret_bindings`, `start_session`, `send_prompt`, `validate_profile`. *Realizes:* FR26, FR48.

---

## 7. Non-functional / UX principles

These are hard constraints on the client surface, not aspirations. They inherit the core PRD's NFRs (esp. **NFR1 local-first**, **NFR2 honesty-by-design**) and translate them into concrete frontend rules. Each carries a `UI-NFRn` id so panel requirements (UI-FRn) can cite them.

- **UI-NFR1 — Honesty-by-design is a first-class UI layer, not a disclaimer.** Every place the product could imply more seamlessness than exists must carry an explicit, non-dismissable honesty affordance sourced from real backend fields (never hard-coded copy):
  - *Memory is bridged, not migrated.* The handoff surface says "carrying a brief" and renders `build_handoff_brief`'s output as a labeled reconstructed brief; it must never render as, or animate into, a continued conversation.
  - *Instructions are equivalent, not identical.* Any instructions preview surfaces `preview_instructions.equivalentNotIdentical` + `fidelityNote` inline next to the artifact — not behind a tooltip.
  - *Profile confidence is per agent.* Merged-profile views show each agent's data-volume-based confidence (`MergedProfile` per-agent weight **and** absolute confidence). Thin history is visible, never smoothed into a single blended number.
  - *Secrets are references.* Configs render `${VAR}` placeholders plus resolvability from `audit_secret_bindings`; a literal token must never be displayable. Generated configs are previewed as diffs before any write (generate-only, drift-flagged, never clobbered).
  - *Gap-fills are labeled.* `GapFill.equivalence` (`equivalent` vs `approximation`) is shown on the item itself; marketplace skills show source before install and generated skills show a reviewable diff with the motivating friction — no auto-install.
- **UI-NFR2 — Local-first is visible.** The UI performs no transcript/source upload; only aggregate profile JSON ever leaves a panel, and only on explicit user action. "Stays on this machine" is a stated, reassuring affordance on profile/handoff surfaces, not fine print. No telemetry beacon fires from these panels by default.
- **UI-NFR3 — Streaming responsiveness.** The thread renders the unified `AgentEvent` stream (`textDelta`, `thought`, `editHunk`, `turnEnded`, `error`) incrementally; it never blocks on a completed turn. Target first-token render < 300 ms after `start_session`/`send_prompt` resolves. `cancel` is reachable at all times during an in-flight turn; per-hunk accept/reject is optimistic and immediate.
- **UI-NFR4 — Keyboard-first command palette.** Every primary action — switch agent, preview/project config, run a profile, start a handoff, generate a continuity report — is reachable from one keyboard-driven palette with zero mouse dependence. Mouse paths are conveniences over the palette, never the only route.
- **UI-NFR5 — Loading / empty / error / degraded states are designed, not defaulted.** Every panel specifies all four (see §8). "Degraded-honest" states (thin profile, drift, unresolved secret, needs-login, tool-ceiling) are explicit, first-class screens — never a spinner that never resolves or an empty div.
- **UI-NFR6 — Accessibility.** Full keyboard navigation and visible focus; streaming text regions use `aria-live="polite"` so deltas are announced without flooding; all honesty/status signals (drift, auth, `equivalent`/`approximation`, resolvable/unresolved) encode meaning with icon + text, never color alone; `prefers-reduced-motion` disables streaming/handoff animations; diff hunks are operable and labeled for screen readers (accept/reject as named controls).
- **UI-NFR7 — Cross-platform webview parity.** The frontend targets Tauri's three native webviews (WebKit / WebView2 / WebKitGTK) and must not depend on engine-specific CSS or JS behavior. Diff and monospace rendering, scroll, and focus behave identically across macOS/Windows/Linux; anything engine-divergent is a bug, verified on all three per NFR5 in the core PRD.
- **UI-NFR8 — Backend honesty by construction.** The UI consumes only the 15 wired IPC commands; it never fabricates capabilities (e.g., there is no "run profile" call — the Profile Skill runs inside an agent session and its JSON is passed to `validate_profile`). Any status the UI shows must trace to a real backend field.

---

## 8. UI states matrix

Every panel defines four states. **Loading** and **error** are generic; **empty** is the "nothing yet" first-run state; **degraded-honest** is the state the product exists to show truthfully — the moment where a lazier tool would fake success. All degraded states are sourced from real IPC fields.

| Panel (IPC source) | Loading | Empty | Error | Degraded-honest |
|---|---|---|---|---|
| **Runtime thread** (`start_session`, `send_prompt`, `cancel`) | Session connecting; skeleton thread + disabled composer | Connected, no turns yet; prompt affordance + "what this agent can see" | `AgentEvent.error` rendered inline in-thread (not a toast that scrolls away); retry/cancel offered | Turn cancelled mid-stream shows partial output clearly marked incomplete; permission pending (see below) |
| **Agent picker / auth** (`list_agents` → `AuthStatus`) | Enumerating agents/adapters | No agents detected / adapters missing; link to doctor | Adapter spawn/handshake failed; per-agent error surfaced | **auth-needed:** `needsLogin` badge guides the user out to the agent's external native login, then re-polls `list_agents` to confirm (no app-driven login command); `error` state distinct from `connected`; never shows a disconnected agent as ready |
| **Permission prompt** (`resolve_permission`) | Awaiting agent request | — | Malformed/denied request explained | Destructive modes never auto-granted; the requested mode is named and must be explicitly chosen |
| **Edit / diff hunks** (`editHunk`, per-hunk accept/reject) | Hunks streaming in | No edits proposed this turn | Hunk apply failed; hunk stays rejectable, file state shown | Partially-accepted turn shows which hunks landed vs were rejected — never an all-or-nothing illusion |
| **MCP config preview** (`preview_mcp`) | Projecting canonical → target | No servers in canonical store for this target | Projection error / unreadable target | **cursor-tool-ceiling:** `warnings` + cumulative `toolCount` shown before write; **secret refs:** `${VAR}` placeholders only |
| **Drift** (`check_drift`) | Comparing on-disk vs canonical | Target file absent (`Missing`) shown honestly, not as error | `Unreadable` file surfaced as its own state, not silent | **drift-detected:** `Drifted{added,removed,changed}` rendered as a diff; write is a reviewed action, never a silent clobber; `InSync` explicitly confirmed |
| **Instructions preview** (`preview_instructions`) | Rendering artifact | No canonical instructions yet | Render error | **equivalent-not-identical:** `equivalentNotIdentical` badge + `fidelityNote` shown adjacent to the artifact, always |
| **Secret bindings** (`audit_secret_bindings`) | Auditing references | No `SecretRef`s across servers | Keychain/env probe failed | **secret-unresolved:** each `SecretBinding` shows `resolvable` + `fromKeychain`; unresolved `${VAR}` flagged as a dead reference before spawn; values never shown |
| **Handoff bridge** (`build_handoff_brief`) | Assembling snapshot / rendering brief | No active source session to hand off from | Snapshot capture/build failed; partial snapshot labeled | **brief-not-session:** output labeled a reconstructed brief for `sourceAgent`→`targetAgent`; pre-switch carry-diff shows what carries vs what is left behind — never implies continuation |
| **Profile** (session run → `validate_profile` → `merge_profiles`) | Skill running inside agent session; per-agent progress | No profile run yet; explain it runs on the agent's own model, local-only | `validate_profile` rejects non-conforming JSON at the boundary — shown as a schema failure, not a fabricated profile | **thin-profile-confidence:** per-agent data-volume confidence surfaced; a one-agent or low-volume profile is visibly less confident, never hidden or blended away |
| **Recommendations** (`recommend_features`) | Matching traits → features | Profile too thin to recommend; says so | Match error | Each `Recommendation` shows `because` + `evidence`; low-confidence source traits carry that confidence forward |
| **Workflow continuity** (`workflow_continuity`) | Computing report for target | No target chosen / no profile | Report generation failed | Four honest buckets always shown, including **genuinelyLost[]** — the product never hides what a switch costs |
| **Gap-fills** (`gap_fills_for`) | Computing gaps for target | No gaps for this target/profile | Generation/index error | Each `GapFill` marked `equivalent` vs `approximation`; marketplace `resolution` shows source before install; `generatedSkill` shown as reviewable diff with motivating friction — nothing auto-installs |

---

## 9. Success metrics

These measure whether the **frontend** delivers the product's value and honors NFR2, and they roll up into the core PRD's success metrics (§8, §13.6). All are measured locally in the client, consistent with UI-NFR2 — no raw content leaves the machine.

- **Dry-run diffs reviewed before write** — % of native-config writes preceded by the user actually opening the `preview_mcp`/`preview_instructions`/`check_drift` diff (the write itself being a Tauri-fs write of the returned `contents`, outside the 15-command engine boundary). Directly instruments core PRD §13.6 *Projection trust* ("the app isn't silently clobbering"). Target: near-100%, because the UI gates writes behind the preview.
- **Handoff uses per active user per week** — count of `build_handoff_brief` briefs that lead to a target-agent session start. Proxy for the moat actually being used; maps to core PRD §8 *Core value* (switches/week via the Handoff Bridge).
- **Carry-diff review rate** — % of handoffs where the user views the pre-switch carry-diff before committing. Pure honesty-surface metric for UI-NFR1; a low rate means the honest labeling is being skipped and needs to be louder.
- **Continuity reports generated, and acted-on rate** — % of active users who run `workflow_continuity`, and of those, % who then act (install a `GapFill` / accept a `Recommendation`). Maps to core PRD §8 *Differentiator* (generate a report, then act on it).
- **Gap-fills installed after review** — % of surfaced `gap_fills_for` items the user installs after opening the source (marketplace) or reviewing the diff (generated). Maps to core PRD §13.6 *Gap-Filling adoption*; split by `equivalent` vs `approximation` to see whether users trust approximations.
- **Friction-pattern dismissal rate** — % of flagged profile friction patterns the user dismisses. Maps to core PRD §8 *Trust*: high dismissal signals low-quality analysis, not a UI win.
- **Secret hygiene, surfaced** — % of projected configs where every `SecretRef` was shown resolvable (via `audit_secret_bindings`) before spawn, and a continuously-asserted **zero** count of literal tokens ever rendered in the UI. Client-side expression of core PRD §13.6 *Secret hygiene* / FR12.
- **Activation funnel completion** — % of installs that reach "≥2 agents `connected` + one projected config sync with the diff reviewed." The client instrumentation of core PRD §8 *Activation*.
- **Time-to-first-streamed-token** — median ms from `send_prompt` to first `textDelta` rendered. Health metric for UI-NFR3; regressions here make the shell feel broken regardless of backend speed.
- **Command-palette action share** — % of primary actions initiated via the keyboard palette vs mouse. Health metric for UI-NFR4; validates keyboard-first is real, not decorative.

---

## 10. Open questions

Product/UX choices to resolve before building the panels they govern. Flag, don't silently pick.

- **Config editing model:** structured **form** over the canonical entity, **raw text + live projected preview**, or a hybrid? The store is the source of truth and native files are generate-only, so a raw editor must edit *canonical*, never the native artifact — which pushes toward forms, but power users may want raw. Governs the MCP/instructions panels.
- **Profile visualization depth:** how far does the profile viz go — an evidence-linked trait list, or charts (task-mix breakdown, radar of traits, friction timeline)? Deeper viz risks implying more certainty than a thin, low-confidence profile warrants (UI-NFR1); confidence must scale the visual weight, so this is an honesty decision as much as a design one.
- **Onboarding: wizard vs inline.** A linear wizard (detect agents → import configs → bind secrets → first profile, per core FR48) versus progressive inline prompts surfaced in-context as each panel is first opened. Wizard is guided but heavy; inline is lighter but risks users never binding a secret or running a profile.
- **Handoff carry-diff: blocking gate vs non-blocking inline.** Force the user through the carry-diff before a switch commits (maximizes honesty, adds friction), or show it inline and let them proceed (faster, weaker honesty guarantee)? Trades UI-NFR1 strength against handoff speed.
- **Drift presentation: passive badge vs blocking banner.** When `check_drift` returns `Drifted`, is it an ambient badge the user can ignore, or a banner that blocks the next write until acknowledged? Affects how "never silently clobber" feels day-to-day.
- **Degraded-state loudness.** How loud is a degraded-honest state (thin profile, `approximation` gap-fill, unresolved secret) — a quiet inline note, or an explicit warning card? Too quiet undermines honesty; too loud trains users to dismiss.
- **Diff defaults:** unified vs split view, and per-hunk vs per-file default granularity for edit hunks and config diffs — one consistent diff component across runtime edits and config previews, or context-specific defaults?
- **Multi-session shell IA (forward-looking):** even though concurrent sessions are a later milestone, the shell's information architecture (tabs vs split panes vs single focused session) is decided now and is expensive to change later.
- **Command palette as primary nav vs supplement:** is the palette the main way to move around (minimal chrome), or a power-user accelerator layered over conventional navigation?
- **Diff/monospace theming across webviews:** one shared theme and density, or per-platform tuning, given WebKit/WebView2/WebKitGTK rendering differences (UI-NFR7)?
