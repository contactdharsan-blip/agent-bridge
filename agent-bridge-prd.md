# Agent Bridge — Product Requirements Document

**Status:** Draft v1
**Owner:** K (Cognifer Labs)
**Last updated:** June 2026
**Companion doc:** `agent-bridge-plan.md` (architecture & build sequence)

---

## 1. Summary

Agent Bridge is a Tauri desktop app that lets a developer use **Claude Code, Codex, and Cursor interchangeably** from one surface — carrying their MCP servers, skills, knowledge base, and instructions across all three, bridging context when they switch agents, and building a **cross-agent profile of how they code** that no single vendor can produce. Its reason to exist is the seam *between* these tools: each agent is strong alone, but nothing today makes moving between them seamless or tells a developer how to keep their workflow when they switch.

---

## 2. Problem

The 2026 reality is that serious developers don't pick one agent — they run several, each for what it's best at (Claude for code quality, Codex for long autonomous runs, Cursor for in-editor work). But the tools are silos:

- **Config is duplicated by hand.** MCP servers, instructions, and rules live in different files and formats per tool (`.mcp.json` JSON vs Codex `config.toml` TOML vs Cursor `.cursorrules`). Keeping them in sync is manual, error-prone busywork.
- **Switching loses context.** Each agent keeps its conversation state private. Moving a task to another agent means re-explaining everything.
- **No one sees across tools.** Each vendor's analytics only sees its own usage, with incompatible metric definitions. A developer has no unified picture of how they actually work or what they'd need to stay productive after switching.

The cost is friction and lock-in-by-inertia: people stay on a suboptimal agent for a task because moving is annoying, not because it's the right tool.

---

## 3. Goals & non-goals

### Goals
- G1. Let a user drive Claude Code, Codex, and Cursor from one unified thread/diff interface.
- G2. Maintain one canonical source of truth for MCP servers, skills, knowledge base, and instructions, projected automatically into each agent's native format.
- G3. Bridge context on agent switch via a structured, re-injected snapshot.
- G4. Produce a cross-agent Vibe-Coder Profile and a Workflow Continuity Report telling users what they need to keep their workflow on a target agent.
- G5. Stay local-first for all history/profile analysis — no transcript or source-code upload.

### Non-goals (v1)
- NG1. Replacing any agent's own model, IDE, or core capability. Agent Bridge orchestrates; it does not re-implement.
- NG2. True memory migration. Context is *bridged* (reconstructed), never transferred from an agent's private state.
- NG3. A team/enterprise admin analytics product. v1 is single-developer, local.
- NG4. Centralized auth/credential storage. Each agent uses its own login.
- NG5. Mobile. Desktop only.

---

## 4. Target users

- **Primary — the multi-agent power user / vibecoder.** Already pays for 2–3 agents, reviews diffs rather than writing code line-by-line, and feels the sync/switch friction daily. Wants one surface and zero duplicated config.
- **Secondary — the agent-curious switcher.** On one tool, considering another, blocked by "will I lose my setup?" The Workflow Continuity Report is aimed squarely at them.
- **Tertiary (later) — small teams** wanting shared, version-controlled agent config. Out of v1 scope but the canonical store is designed not to preclude it.

---

## 5. User stories

- As a multi-agent user, I add an MCP server once and it appears, correctly formatted, in all three agents.
- As a developer mid-task, I switch from Claude to Codex and the new agent opens already knowing my working dir, open files, task list, and recent decisions.
- As someone eyeing Codex, I ask "what do I need to keep my workflow?" and get a concrete list: what transfers automatically, what needs a substitute, what to add, what I'll lose.
- As a curious developer, I run a profile and see how my time splits across task types and agents, and which friction patterns recur — with evidence, locally, without uploading my code.
- As a user near Cursor's tool ceiling, I'm warned before a config that's fine in Claude silently breaks Cursor.

---

## 6. Functional requirements

### 6.1 Unified runtime (ACP client host)
- FR1. Spawn each agent as a subprocess via its ACP adapter; bundle prebuilt adapter binaries so users install nothing extra.
- FR2. Render one thread UI for all agents from ACP message types (text deltas, tool calls, edit hunks, task lists).
- FR3. Per-hunk accept/reject on file edits.
- FR4. Surface ACP permission modes; never auto-grant destructive modes.
- FR5. One-control agent switch; show what context will carry before committing.

### 6.2 Projection Engine (canonical → native)
- FR6. Single canonical store is the source of truth; native config files are generate-only.
- FR7. Project MCP servers to Claude JSON, Codex TOML, Cursor JSON.
- FR8. Manage skill placement (SKILL.md is already cross-agent) and pass through AGENTS.md.
- FR9. Project one canonical instructions doc to CLAUDE.md / Codex config / `.cursorrules`, labeled "equivalent, not identical."
- FR10. Warn before emitting a config exceeding Cursor's ~40-tool ceiling; show cumulative tool count per target.
- FR11. Detect out-of-band hand-edits to native files and flag rather than silently clobber.
- FR12. Never inline secrets; reference env vars or OS keychain.

### 6.3 Handoff Bridge
- FR13. On switch, capture a Context Snapshot (working dir, open files, task list, recent edits, decisions, conversation summary, active MCP/skills).
- FR14. Re-inject the snapshot as the incoming agent's opening turn.
- FR15. Label the handoff honestly as carrying a brief, not continuing a session.

### 6.4 Vibe-Coder Profile
- FR16. Ship one authored **Profile Skill** (SKILL.md + script) deployed into all three agents via the Projection Engine.
- FR17. The skill reads that agent's local history and emits a rich, strict `CoderProfile` JSON against a shared taxonomy, running natively on whatever model the host agent already uses (no separate API key or self-hosted model).
- FR18. Extraction is deliberately high-dimensional (task mix, friction signatures, repeated phrasings, tool reach, session rhythms, abandon/persist tendencies, agent affinity) so each profile is individually distinctive.
- FR19. Merge the three JSON profiles confidence-weighted by available data volume; show per-agent confidence.
- FR20. All analysis local-first; only aggregate JSON is collected, never raw transcripts/code.
- FR20a. **Personalization & matching:** present the profile as a characterization of the individual ("you're a refactor-heavy explorer…") with evidence per trait, and match the person's traits against a structured map of each platform's features to produce per-person recommendations of which features they should use and what config makes each platform fit them.

### 6.5 Workflow Continuity Report & Gap-Filling Engine
- FR21. For a chosen target agent, output four sections: transfers automatically / needs a substitute / add for parity / genuinely lost.
- FR22. Generate profile-specific rules and skills (e.g. a repeated instruction → a rule in each agent's format) to encode the user's habits on the target.
- FR22a. **Gap-Filling Engine:** for any capability that doesn't map one-to-one between harnesses, resolve it with a skill — first by recommending an existing skill from a curated GitHub/marketplace index, otherwise by generating a custom skill (capability-replicating or profile-specific). The Projection Engine then deploys it to the target harness.
- FR22b. Mark each gap-filler as "equivalent" vs "approximation" (a skill can replace a behavior but not always a runtime integration). Surface marketplace skills' source before install (never auto-install third-party code); present generated skills as reviewable diffs with the friction pattern that motivated them.

### 6.6 Auth
- FR23. Surface each agent's native login flow; store nothing sensitive. Recommend bring-your-own API key as the durable path; show per-agent auth status (connected / needs-login / error).

---

## 7. Non-functional requirements

- NFR1. **Privacy/local-first** is a hard constraint, not a feature — no source code or raw transcripts leave the machine.
- NFR2. **Honesty by design** — memory is bridged not migrated, instructions are equivalent not identical, profile data confidence is shown per agent. The UI must not imply more seamlessness than exists.
- NFR3. **Swappable adapters/ingesters** — every native format and log format can change; keep projectors and the Profile Skill thin and replaceable.
- NFR4. **No-install agents** — bundle adapter binaries; the user shouldn't assemble a toolchain.
- NFR5. **Cross-platform** — macOS first, then Windows/Linux (Tauri + native webview).
- NFR6. **Built to be vibecoded** — the solo builder directs agents and reviews diffs rather than hand-writing the core. The codebase must therefore keep its un-reviewable surface (concurrent/transport code) minimal and behind a tested contract, and push the majority of logic into pure, test-verifiable functions. This is an architectural requirement, not a workflow preference: a design that demands trusting un-runnable diffs is, for this team, an un-buildable design. (See plan §6b.)

---

## 8. Success metrics

- **Activation:** % of installs that connect ≥2 agents and complete one projected config sync.
- **Core value:** # of agent switches per active user per week using the Handoff Bridge (proxy for "seamless" actually being used).
- **Differentiator:** % of users who generate a Workflow Continuity Report, and of those, % who act on it (add a recommended skill/rule).
- **Retention:** week-4 retention of users who connected ≥2 agents vs ≥1.
- **Trust:** profile-feature opt-in rate and dismissal rate of flagged friction patterns (high dismissal = low-quality analysis to fix).

---

## 9. Scope & sequencing (maps to plan milestones)

| Phase | Ships | Plan milestone |
|---|---|---|
| MVP | One agent end-to-end in the unified shell | M1 |
| MVP+ | Second agent; abstraction proven | M2 |
| v1 core | MCP projection + Cursor tool-ceiling warning | M3 |
| v1 core | Skills/AGENTS.md/instructions projection | M4 |
| v1 differentiator | Handoff Bridge | M5 |
| v1 differentiator | Profile Skill (Claude first) → cross-agent profile + Continuity Report | M5b–M5c |
| v1 complete | Cursor as third agent | M6 |
| polish | Drift detection, auth status, keychain, onboarding | M7 |

---

## 10. Key risks (product framing)

1. **The differentiated core is narrow.** Skills and AGENTS.md are already cross-agent; MCP projection is a known pattern. The real moat is the runtime shell, the Handoff Bridge, and the cross-agent profile/continuity report — the last being genuinely unserved. Risk: shipping the table-stakes layers without nailing the moat layers yields a "why not just use Zed/JetBrains?" product. Mitigation: treat M5–M5c as the product, not the finale.
2. **Trust is the profile's lifeblood.** Any code/transcript upload, or visibly wrong analysis, kills it. Mitigation: local-first hard constraint, evidence-linked claims, user-dismissable patterns, per-agent confidence.
3. **Memory wall mis-set expectations.** If users expect true continuation, the handoff feels broken. Mitigation: honest labeling as a first-class UX principle.
4. **Format churn.** Codex log/config formats are explicitly evolving; Cursor's ACP support is the weakest leg. Mitigation: thin swappable projectors/ingesters; never make the foundation depend on Cursor.
5. **Auth fragility.** Subscription OAuth for third-party tools is a moving, restricted target. Mitigation: BYO-API-key as the recommended path; never centralize credentials.
6. **Solo-builder execution risk.** The build is led by one person directing agents and reviewing diffs; the hardest components (ACP transport, profile merge) fail at runtime, not in review. Mitigation: trust-zone discipline and execution-based verification (plan §6b), thin-vertical-slice sequencing so the riskiest code is proven first and cheap. This is the most probable failure mode of the project — not the market, the build process.

---

## 11. Open questions

- Canonical store: SQLite + on-disk files, or files-only with git-style history?
- Profile depth: how much history per run by default, and should a "deep scan" option trade speed/token-cost for a richer, more distinctive profile?
- v1 knowledge-base scope: AGENTS.md + instructions only, or a richer projected doc store?
- Comparative/aggregated profiles and a third-party skill-matching marketplace: in the vision, but in or out of v1?
- Pricing/packaging (not yet addressed): one-time vs subscription; does the profile layer anchor a paid tier?

---

## 12. Appendix — what makes this defensible

The portability of skills (SKILL.md) and repo context (AGENTS.md) is *already* solved at the format level, and MCP projection is a known pattern. So Agent Bridge's durable advantage is not "it moves config" — it's the three things nothing else does together: a single runtime shell over all three agents, an honest context-handoff on switch, and a **cross-agent coder profile produced by one shared analysis skill** that is deliberately high-dimensional so it feels unique to each person, then matched against each platform's features to tell that specific developer which tools and config fit *them*. The Profile Skill also dogfoods the product's own portability claim — it's the first skill the Projection Engine deploys everywhere.
