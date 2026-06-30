# Agent Bridge — Build Plan

A Tauri desktop app that lets a developer move fluidly between **Claude Code**, **Codex**, and **Cursor**, carrying their MCP servers, skills, knowledge base, instructions, and planning/memory context across all three.

---

## 0. The one idea the whole product rests on

There are two fundamentally different kinds of "portability" here, and conflating them is the trap that sinks projects like this:

- **Substrate-portable** — things that have (or can have) a shared format. These can be *genuinely* seamless. MCP configs, SKILL.md skills, AGENTS.md repo context, and custom instructions all fall here.
- **Reconstruction-only** — things each agent keeps private and never shares. Live conversation memory and in-flight session state fall here. These can only be *bridged* (summarized and re-injected), never *migrated*.

The product is honest and feels great when it makes the first category invisible and the second category **explicit, fast, and well-designed**. It feels broken when it pretends the second category is the first and silently drops state.

So the architecture has two engines:

1. **Projection Engine** — one canonical source of truth → emit each tool's native format. (Substrate-portable layers.)
2. **Handoff Bridge** — capture a structured context snapshot from the outgoing agent → re-inject as the opening turn of the incoming agent. (Reconstruction layer.)

Everything below serves these two engines plus the runtime shell that hosts the agents.

---

## 1. Architecture overview

```
┌──────────────────────────────────────────────────────────┐
│  Tauri App                                                │
│                                                           │
│  ┌─────────────────┐         ┌──────────────────────────┐ │
│  │  Web Frontend   │ ◄─IPC─► │  Rust Core               │ │
│  │  (unified UI)   │         │                          │ │
│  │                 │         │  • ACP Client Host       │ │
│  │  • thread view  │         │    (spawns + talks to    │ │
│  │  • diff/approve │         │     each agent process)  │ │
│  │  • agent switch │         │  • Projection Engine     │ │
│  │  • config panel │         │  • Handoff Bridge        │ │
│  │  • workspace    │         │  • Canonical Store (SQLite)│ │
│  └─────────────────┘         └──────────────────────────┘ │
└───────────────────────────────┬──────────────────────────┘
                                 │ JSON-RPC over stdio (ACP)
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
       claude-agent-acp     codex ACP adapter   cursor ACP adapter
       (subprocess)         (subprocess)        (subprocess)
```

**Why Tauri fits:** the Rust core is the natural home for process lifecycle, JSON-RPC transport, file projection, and the canonical store; the web frontend gives you one chat/diff surface that renders identically regardless of which agent is driving — which is what "seamless switching" actually looks like to a user. You stay in web-frontend territory while the heavy plumbing lives in Rust.

**Vibecoding reality check (read this before M1).** This app has an uncomfortable property for a diff-reviewing builder: its hardest parts are exactly the parts that *don't* reveal their bugs in a diff. A Rust subprocess manager, stdio JSON-RPC framing, and a confidence-weighted merge are stateful and concurrent — they fail at runtime, under specific timing, not on the page. Reviewing those diffs tells you the code *looks* plausible, not that it *works*. So the whole plan is organized around one principle: **push complexity to the edges where it's verifiable, and make the un-reviewable core as small and as tested-by-execution as possible.** Concretely that means three rules, applied throughout:
- **Projectors and generators are pure functions** — input in, file out, no state. These are the safe-to-vibecode majority of the codebase: you verify them with round-trip tests (canonical → native → canonical → diff), which an agent can write and run, so correctness is *demonstrated*, not eyeballed.
- **The un-reviewable core is small and behind a contract.** The ACP host (spawning, JSON-RPC, streaming) is the one place you cannot trust a diff. Treat it as a fixed boundary: lean on Zed's `agent-client-protocol` crate instead of hand-rolling transport, wrap it in an integration test that spawns a real adapter and asserts on a real round-trip, and once it's green, stop touching it. Don't let an agent "improve" it casually.
- **Every milestone ends in something you can run, not just read.** A diff you can execute is a diff you can trust. The milestone order below is built so each step produces a runnable artifact, because for this codebase execution is the only review that catches the real failures.

**Why ACP is the spine:** all three agents already speak the Agent Client Protocol (Claude via `zed-industries/claude-agent-acp`, Codex via Zed's adapter, Cursor via a community adapter). ACP standardizes the *runtime* (prompts, tool calls, edit hunks, task lists) so your frontend renders one message model for all three. You are building an ACP *client host*, not three bespoke integrations.

---

## 2. The Canonical Store (single source of truth)

One local store (SQLite + a set of canonical files on disk) that owns the truth for every projectable layer. Each agent's native config files become *generated artifacts*, never hand-edited.

| Canonical entity | Projects to Claude Code | Projects to Codex | Projects to Cursor |
|---|---|---|---|
| MCP server (name, transport, cmd/args/env or url/headers) | `~/.claude.json` / `.mcp.json` (JSON) | `.codex/config.toml` (TOML, `[mcp_servers.*]`) | `.cursor/mcp.json` (JSON, `mcpServers`) |
| Skill (SKILL.md folder) | `~/.claude/skills/<name>/` | Codex skills dir | Cursor skills dir |
| Repo knowledge | `AGENTS.md` (shared standard — no projection needed) | same | same |
| Custom instructions | `CLAUDE.md` | Codex system-prompt config | `.cursorrules` / Rules for AI |

Design rules:
- **Generate-only targets.** The app writes native files; users edit the canonical entity. (Mirrors the chezmoi-template discipline that already works in the wild.)
- **Secrets never inlined.** `env`/headers reference shell vars or an OS-keychain entry, never literal tokens in committed files.
- **Constraint-aware projection.** Warn before emitting a config that's valid for Claude Code but breaks Cursor's ~40-tool ceiling. Surface the cumulative tool count per target.
- **Drift detection.** If a native file was hand-edited out-of-band, flag it on next sync rather than silently clobbering.

---

## 3. The two engines

### 3a. Projection Engine (the seamless part)

A pure function per target: `canonical → native format`. Three projectors (Claude-JSON, Codex-TOML, Cursor-JSON) for MCP; thin file-placement logic for skills (SKILL.md is already cross-agent, so this is copy/symlink, not translation); pass-through for AGENTS.md; and an instructions projector that emits CLAUDE.md / Codex config / .cursorrules from one canonical instructions doc.

**Honest caveat baked into the UI:** instructions *project* cleanly but don't *behave* identically — each agent injects/weights them differently. The app should label projected instructions as "equivalent, not identical," so the user isn't surprised when Cursor and Claude Code act slightly differently on the same rules.

### 3b. Handoff Bridge (the honestly-good part)

When the user switches agents mid-task, capture a **Context Snapshot** from the outgoing agent and re-inject it as the incoming agent's opening turn. This is reconstruction, and the UI should say so plainly ("Carrying context to Codex…") rather than implying a seamless mind-meld.

Context Snapshot schema (this is *your* IP — no agent gives it to you for free):

```
ContextSnapshot {
  working_directory: path
  open_files: [path]
  task_list: [ {text, status} ]        // ACP exposes task lists — capture them
  recent_edits: [ {file, hunk_summary} ]
  decisions: [ short bullets ]          // distilled, not raw transcript
  conversation_summary: string          // model-generated digest of the session
  active_mcp + skills: [names]          // so the incoming agent's env matches
  timestamp, source_agent, target_agent
}
```

Generation strategy: at switch time, ask the *outgoing* agent (or a cheap summarizer model) to produce the digest, attach the deterministic fields (cwd, files, task list, diffs) you already hold, then format it as the first user message to the incoming agent. The receiving agent starts fresh and reads the brief — it does not inherit hidden state. Setting that expectation is a feature, not an apology.

---

## 4. Runtime shell (ACP client host)

In the Rust core:
- **Process manager** — spawn/kill/restart each agent adapter as a child process; bundle the prebuilt adapter binaries (Claude adapter ships single-file binaries for macOS/Win/Linux) so users install nothing extra.
- **JSON-RPC transport** — stdio framing, request/response correlation, streaming deltas. Use Zed's `agent-client-protocol` Rust crate rather than hand-rolling.
- **Session router** — maps the active thread to the current agent; switching = route next prompt to a different subprocess (after the Handoff Bridge runs).
- **Permission gate** — surface ACP permission modes (default / acceptEdits / bypass) in the UI; never auto-grant destructive modes.

In the frontend:
- **Unified thread + multibuffer diff** — render ACP message types (text deltas, tool calls, edit hunks, task list) identically for all agents; accept/reject individual hunks.
- **Agent switcher** — one control; shows what will be carried in the handoff before committing.
- **Config panel** — edit canonical entities; preview the projected native files per target before writing.

---

## 5. Auth reality (plan around it, don't paper over it)

Each agent owns its own auth and you cannot centralize it:
- Claude Agent → Claude Code auth / API key
- Codex → ChatGPT login, Codex key, or OpenAI key
- Cursor → its own subscription/CLI auth, which doesn't configure the others

So the app **surfaces each agent's native login flow** and stores nothing sensitive itself. The durable, least-fragile path to recommend to users is **bring-your-own API key per provider**, because subscription-OAuth for third-party tools has been a moving, restricted target. Treat per-agent auth status as first-class UI state (connected / needs-login / error), not a hidden assumption.

---

## 5b. The Vibe-Coder Profile (the differentiating layer)

This is where the app stops being plumbing and becomes something with a defensible reason to exist. The insight: each agent can see its own usage, but **nothing can see across all three** — there is no native cross-tool comparison; each vendor's dashboard only sees its own tool, with different metric definitions. That gap is the product opportunity.

### What already exists to build on

- **Claude Code `/insights`** — a built-in command that reads local session transcripts (last ~30 days, `~/.claude/projects/`), runs a local Haiku analysis, and produces an interactive HTML report at `~/.claude/usage-data/report.html` with friction patterns, task-category breakdown, and **copy-paste-ready CLAUDE.md rules and skill/feature suggestions**. Everything is local; source code is never uploaded. Cached "facets" live in `~/.claude/usage-data/facets/`.
- **Proof the parse→config pattern works:** an open-source CLI (`claude-insights`) already parses the `/insights` HTML and emits production-ready CLAUDE.md rules, skill files, and a prioritized to-do list. This de-risks our hardest step — extraction from the report is known-feasible.
- **Codex side:** Codex writes local session JSONL under `~/.codex` (`sessions/`, `archived_sessions/`) with per-turn `token_count` events. Tools like `ccusage` and `codex-usage-tracker` already read these into task/usage breakdowns. So Codex has *raw material* for a profile even though it has no `/insights` equivalent.
- **Cursor side:** weakest local introspection; lean on what's available and treat Cursor profile data as lower-fidelity.

### What we build: a unified, cross-agent coder profile

A profile engine that ingests each agent's local history through its native source, normalizes it into one schema, and produces a **single picture of how this specific user actually codes** — across all three tools at once, which no vendor offers.

```
CoderProfile {
  task_mix:        { debug, implement, refactor, tests, docs, infra, ... }  // normalized across agents
  friction_points: [ {pattern, evidence_examples, which_agent, frequency} ]
  repeated_instructions: [ recurring prompt patterns → candidate rules ]
  tool_usage:      { edit, bash, mcp_calls, web, ... per agent }
  efficiency:      { abandoned_sessions, retry_loops, context_bloat, cache_reuse }
  strengths:       [ what this user does well / leans on ]
  agent_affinity:  { which agent they reach for, for which task type }
}
```

### Generation strategy: ship our own analysis skill, don't scrape three native outputs

The naive approach — parse Claude's `/insights` HTML, parse Codex's JSONL, scrape whatever Cursor exposes — inherits three different fidelities and three different metric definitions, and leaves you forever chasing format churn. The better approach exploits the fact that **`/insights` is conceptually just a skill**: an analysis pass over local transcripts that emits a structured report. Since SKILL.md is an open standard that runs in Claude Code, Codex, *and* Cursor, you can author **your own profiling skill once and ship it into all three agents.**

Call it the **Profile Skill**. It's a SKILL.md (plus a small script) that instructs whichever agent it's running in to: read that agent's local session history, classify tasks into your normalized taxonomy, detect friction patterns and repeated instructions, capture tool-usage and efficiency signals, and emit the result as a **rich, strict JSON document matching the `CoderProfile` schema** — not free-form prose, not an HTML report. Because the *same* skill defines the *same* taxonomy and the *same* output contract, every agent produces directly-comparable profile data. You've moved normalization from "three brittle parsers after the fact" to "one shared instruction up front." This is the cleanest fix for the quality-asymmetry problem.

The skill runs natively inside each agent — it uses whatever model that agent is already running, no separate API key or self-hosted model. Its job is to be the **data-gathering instrument**: extract everything needed to build a profile and hand back structured JSON. The intelligence and differentiation live in (a) how rich and well-designed the skill's extraction rubric is, and (b) what your app *does* with that data afterward — the matching and personalization below — not in controlling the model.

Concretely:

- **The skill is the equalizer.** Cursor's weak native introspection matters less, because you're not relying on Cursor's *native* analytics — you're running *your* analysis skill inside Cursor against its local history, with the same rubric you use everywhere.
- **Rich extraction is the whole game.** The more the skill captures — not just "you debug a lot" but *how* you prompt, where you backtrack, which instructions you repeat verbatim, when you abandon vs. push through, your peak hours, your characteristic phrasings — the more unique and personal the resulting profile. Design the skill to over-collect signal, because personalization quality is bounded by what it gathers.
- **Native sources feed it.** The skill reads `~/.claude/projects/`, `~/.codex/sessions/`, and Cursor's accessible history respectively, interpreting them uniformly. Where a native report already exists and is cheap (Claude's `/insights`), it can serve as a cross-check.
- **Local-first preserved.** The skill runs on the user's machine against local logs; only aggregate JSON is collected by the app, never raw transcripts or code.

Net effect: the profile engine's input is no longer "three native outputs of varying quality" but "one JSON contract emitted by one skill running in three hosts." The Rust core collects three `CoderProfile` JSON blobs and merges them — confidence-weighted if any agent has thin history, but no longer lopsided by *tooling* quality, only by *data volume*.

> Bonus: this Profile Skill is itself a concrete, dogfooded example of the cross-agent skill portability your product sells. It's the first skill your own Projection Engine ships everywhere — proof the mechanism works, built into the product's own operation.

### Personalization: the profile must feel unique to each person

The product promise is that the profile feels like *you*, not a generic dashboard. Two mechanisms deliver that:

**1. A high-dimensional, individual fingerprint.** The skill captures enough distinct signals that no two profiles look alike — task mix, friction signatures, repeated phrasings, tool reach, session rhythms, abandon/persist tendencies, agent affinity per task type. The profile is presented as a *characterization of this specific developer* ("you're a refactor-heavy explorer who front-loads context and abandons quickly when a path stalls"), with the concrete evidence behind each trait, not a leaderboard of impersonal metrics. The richer the extraction, the more the result reads as a mirror rather than a template.

**2. Profile-to-platform matching.** This is where personalization becomes *useful*, not just flattering. The app holds a structured map of each platform's features (Claude subagents, hooks, `/context`, skills; Codex parallel terminals, long-autonomy, token-window behavior; Cursor Tab model, `/best-of-n`, multi-provider routing). It matches the individual's measured traits against those features to produce **personalized recommendations**: which features *this* person should be using given how *this* person actually works.

Examples of the matching logic (the app's, not the skill's):
- High abandon-rate + many short exploratory sessions → recommend Cursor `/best-of-n` (try multiple approaches fast) and Claude `/context` (see why a thread bloated before abandoning).
- Refactor-heavy + clear task decomposition → recommend Codex parallel terminals and Claude subagents.
- Same instruction repeated across half your sessions → generate that instruction as a rule for each platform so the habit is encoded everywhere.
- Heavy MCP reliance → flag Cursor's ~40-tool ceiling specifically for *your* server set.

The output is a per-person statement of the form: *"Given how you code, here are the features on each platform you're underusing, and here's the config that makes each platform fit you."* That is the personalization payload — the profile describes the person; the matching tells them what to do with each tool because of who they are.

One honest limit to keep visible: a skill can only analyze the history a given agent actually writes to disk, in the format it writes. Codex's log format is explicitly still evolving, and Cursor exposes the least. So the skill narrows the gap dramatically but doesn't fully erase it — surface per-agent confidence based on *data availability*, even though *analysis quality* is now uniform.

### The feature that makes it sticky: "Keep your workflow when you switch"

Because the profile knows *how the user works* and the Projection Engine knows *what each agent supports*, the app can answer the question every multi-agent user actually has: **"If I move this work to Codex/Cursor, what do I need so it still feels the same?"**

Concretely, a **Workflow Continuity Report** that, for a chosen target agent, tells the user:

1. **What transfers automatically** — your MCP servers, skills (SKILL.md is already cross-agent), and AGENTS.md carry over; here's the projected config.
2. **What needs a substitute** — "On Claude Code you rely on `/insights` and subagents heavily; Codex has no native `/insights`, but our Profile Skill gives you the same analysis there; and Codex parallel-terminal tasks replace Claude subagents for your refactor-heavy mix."
3. **What to add to keep parity** — generated, profile-specific rules and skills. E.g. if the profile shows you repeat the same formatting instruction in half your sessions, emit that as a CLAUDE.md rule *and* its Codex/Cursor-instruction equivalents, so the habit is encoded in whichever agent you land on.
4. **What you'll lose / what's genuinely different** — honest gaps (e.g. Cursor's ~40-tool MCP ceiling means a subset of your servers; Claude-specific `/context` introspection has no Codex twin). Name it rather than hide it — same honesty principle as the memory wall.

This turns the profile from a vanity dashboard ("here's how you code") into an **actionable migration aid** ("here's how to stay productive when you move"), which is exactly the seam between your Projection Engine and Handoff Bridge.

### The Gap-Filling Engine: skills as universal patches for missing native features

Points 2–4 of the Continuity Report all rest on one capability worth promoting to its own subsystem: **whenever a feature does not map one-to-one between harnesses, resolve the gap with a skill.** Because SKILL.md runs across Claude Code, Codex, and Cursor, a skill is the portable substitute for a native capability one harness has and another lacks. This converts "feature parity" from an impossible goal (you can't make Codex *be* Claude) into a tractable one (you can give Codex a skill that *does the job* the missing feature did).

The engine works in two modes, tried in order:

**1. Recommend an existing skill (GitHub / marketplace first).** Before building anything, search the open skill ecosystem for something that already fills the gap. The SKILL.md standard means skills published for one harness generally run in the others, so a community skill that reproduces, say, a `/context`-style introspection or a subagent-style fan-out is a candidate regardless of which harness its author targeted. Maintain a curated index of known-good skills keyed to the capability gaps they fill. This is the cheapest, fastest fix and seeds an ecosystem rather than a walled garden.

**2. Generate a custom skill to fill the gap.** When nothing suitable exists — or when the gap is *personal* (specific to this user's measured workflow rather than a generic feature) — author one. Two flavors:
   - **Capability-replicating skills:** recreate a missing native feature's behavior as a skill on the target harness. Example: Claude's `/insights` has no Codex equivalent, so your own Profile Skill *is* a generated capability-replicating skill — the pattern, generalized. Other examples: a context-budget reporter for harnesses lacking `/context`, a structured task-decomposition skill standing in for subagents.
   - **Profile-specific skills:** generated from the user's own friction signatures, so they fill a gap unique to that person. If the profile shows premature-solution-without-verification, emit a skill that forces codebase verification first — and emit it for whichever harness the user is moving to. These are the most defensible output because they can't be copied from a marketplace; they're synthesized from one person's data.

How it plugs into the rest of the system:
- The **profile** identifies the gap (this user leans on feature X; target harness lacks X).
- The **platform-feature map** confirms it's a genuine non-one-to-one gap, not just a different name for the same thing.
- The **Gap-Filling Engine** resolves it: marketplace skill if one fits, generated skill otherwise.
- The **Projection Engine** deploys the resulting skill into the target harness like any other skill.

So the Continuity Report's "what needs a substitute" and "what to add for parity" sections are not hand-written advice — they're the visible output of this engine. Every named gap comes with a concrete resolution (a recommended skill link or a generated SKILL.md), not just a description of what's missing.

Honest boundaries, so the engine doesn't overpromise:
- **A skill can replace a *behavior*, not always an *integration*.** Some native features are wired into the harness's runtime (a real `/context` reads the live token window; a skill can only approximate it from what's observable). Mark these as "approximation" vs "equivalent," same honesty discipline as instructions projection.
- **Marketplace skills are third-party code.** Recommending one means surfacing its source and what it does before the user installs; never auto-install a community skill silently. Treat an unreviewed skill as untrusted content.
- **Generated skills need review, not blind trust.** Present a generated gap-filler as a reviewable diff (natural for a vibecoder), with the friction pattern it was built from shown alongside, so the user can see *why* it exists.

### Comparative / "skills marketplace" angle

Two extensions worth scoping but not necessarily v1:

- **Comparative profiles across users (opt-in, aggregated):** with consent, anonymized profiles let a user see "developers with your task-mix tend to use these 3 skills/MCP servers you're missing." This is a recommendation layer, not surveillance — it must be opt-in, aggregate-only, and local-by-default, or it violates the privacy expectation that makes `/insights` acceptable in the first place.
- **Let others publish skills against profile patterns:** a lightweight format where a skill author declares "this skill helps with `friction_point: premature-solutions` / `task: refactor`," so the profile engine can *match* third-party skills to a user's measured friction. This pairs directly with the Gap-Filling Engine's marketplace mode — authors publishing capability-replicating skills keyed to known gaps become the supply side of your recommendation index. This is how you'd build an ecosystem on top of the profile rather than just shipping a closed tool. SKILL.md frontmatter already carries a `description`/when-to-use field you can key matching off.

### Honest caveats for this layer

- **`/insights` quality is uneven.** Reports have been observed inventing stats and occasionally over-coaching. Treat its output as *signal to normalize and verify*, not ground truth — surface evidence examples, let the user dismiss false patterns.
- **Asymmetric data, not asymmetric analysis.** The Profile Skill makes the *extraction rubric* uniform across agents (same taxonomy, same JSON contract), so profiles are comparable by construction. What remains uneven is *data availability* — Claude writes the richest local history, Codex moderate (and its format is still evolving), Cursor the least. Show confidence per agent based on how much history was available. Note the skill runs on each agent's own model, so phrasing of qualitative tags may vary slightly between agents; keep the schema strict and the categories closed so that variance can't distort the structured fields.
- **Local-first is a hard constraint, not a nice-to-have.** The moment this layer uploads transcripts or code, it loses the trust that the native `/insights` privacy model grants. Match that posture.
- **Formats churn.** Codex log format is explicitly evolving; keep the ingesters thin and swappable, same discipline as the config projectors.

---

## 6. Build sequence (milestones)

Each milestone is tagged by how safely it vibecodes: 🟢 **safe** (pure/verifiable by tests an agent can write and run — delegate freely), 🟡 **scrutinize** (review the diff carefully, the logic is subtle), 🔴 **execution-only** (a diff review will *not* catch the bugs — gate it behind a runtime integration test before trusting it).

**M1 — One agent, end to end. 🔴** Tauri shell + Rust ACP host spawning the Claude adapter; complete the handshake; render one streamed response and one accept/reject diff. Validates the entire transport + UI loop on the smallest surface. *Vibecoding note:* this is the single riskiest milestone to delegate, because the ACP host is the un-reviewable core. Do it first anyway — get it working once, write an integration test that spawns the real Claude adapter binary and asserts a real prompt→response→edit round-trip, then freeze it. The bundled adapter binary means you can run this for real on day one; don't proceed to M2 until the test is green.

**M2 — Second agent (Codex). 🟡** Add Codex as a config entry, not new rendering code. If anything in the frontend needs special-casing per agent, that's the signal your client layer leaked agent-specific assumptions — fix it here while it's cheap. *Vibecoding note:* the win condition is *zero* new rendering logic. When you review this diff, the thing to check is the absence of `if agent == codex` branches in the UI — leaked branches here are the bug, and they *are* visible in the diff, which is why this is 🟡 not 🔴.

**M3 — Projection Engine v1 (MCP). 🟢** Canonical MCP model → JSON ×2 + TOML. *Verification that proves it:* round-trip test — import existing native configs → canonical → re-emit → diff against original; it should be identity (modulo formatting). Add Cursor 40-tool warning. *Vibecoding note:* delegate this freely. Pure functions, and the round-trip test is the proof, so you don't need to trust the diff — you trust the test passing. Have the agent write the test first.

**M4 — Skills + AGENTS.md + instructions projection. 🟢** Mostly placement for skills/AGENTS.md (copy/symlink); real projection for instructions with the "equivalent-not-identical" labeling. *Vibecoding note:* same safe profile as M3 — verify instruction projection with a snapshot test (one canonical doc → assert the three native outputs byte-for-byte), so regressions surface as a failed snapshot, not a missed diff line.

**M5 — Handoff Bridge. 🟡** Context Snapshot capture + re-injection. This is the centerpiece UX — give it real design time, not a corner. *Vibecoding note:* the deterministic fields (cwd, files, task list, diffs) are 🟢. The one subtle part is the summary prompt and the re-injection format — review *that* carefully, since a bad brief silently degrades every switch. Test it by switching mid-task and reading what the receiving agent actually got.

**M5b — Profile Skill v1 (authored once, run in Claude first). 🟡** Write the Profile Skill (SKILL.md + script) that emits rich `CoderProfile` JSON natively inside the agent. Validate it in Claude Code against `~/.claude/projects/`, cross-checking output against native `/insights` for sanity. Build the profile-to-platform matching map and ship the single-agent personalized profile + recommendations view. *Vibecoding note:* the SKILL.md is prose — your native medium, fully reviewable, 🟢. The 🟡 part is the JSON schema being *strict* (closed enums, required fields) so downstream merge code can trust it; validate every skill output against a JSON Schema and reject non-conforming output rather than letting loose JSON propagate.

**M5c — Run the same skill in Codex + Cursor; cross-agent profile + Workflow Continuity Report + Gap-Filling Engine. 🟡** Deploy the *same* Profile Skill into Codex and Cursor via the Projection Engine, collect three JSON blobs, merge confidence-weighted. Build the Gap-Filling Engine (curated skill index for marketplace-recommend mode + generator for capability-replicating and profile-specific skills) and wire it as the source of the Continuity Report's "substitute" and "parity" sections. *Vibecoding note:* the merge is the 🔴-adjacent bit (confidence weighting has silent-wrong failure modes — a bug here produces a plausible-but-wrong profile you won't notice). Pin it with table-driven tests: hand-write three input profiles with known overlaps and assert the exact merged output. The Gap-Filling generator output is 🟢 because every generated skill is a reviewable SKILL.md diff by design.

**M6 — Cursor as third agent. 🔴** Least-mature ACP adapter; treat as the stress test that proves the abstraction, not the foundation. Add Cursor profile ingestion at lower fidelity here. *Vibecoding note:* 🔴 for the same reason as M1 (new adapter = new transport edge cases), but lower stakes because the abstraction is proven by now. If Cursor's adapter fights you, ship without it — the architecture explicitly doesn't depend on it.

**M7 — Polish: 🟢** drift detection, per-agent auth status, secrets-in-keychain, bundled adapter binaries, onboarding. *Vibecoding note:* mostly safe, with one 🟡 exception — keychain integration is platform-specific and fails silently when wrong; test it by actually storing and retrieving a throwaway secret on each OS.

---

## 6b. Vibecoding execution playbook

This section is about *how you, specifically, build this* — directing agents and reviewing diffs rather than hand-writing the hard parts. The architecture above was shaped to make that viable; this is the operating manual.

### The reviewability map

The codebase splits cleanly into three trust zones. Know which zone you're in before you accept a diff.

| Zone | What's in it | How you verify | Trust the diff? |
|---|---|---|---|
| 🟢 Pure | Projectors, generators, the matching map, SKILL.md authoring | Round-trip / snapshot tests the agent writes and runs | No need to — trust the passing test |
| 🟡 Stateful-but-local | Handoff snapshot assembly, profile merge, instruction projection semantics | Hand-written table tests with known inputs/outputs; run the real flow and read the result | Partly — review logic, confirm with execution |
| 🔴 Concurrent/transport | ACP host (spawn, JSON-RPC, streaming), new adapters, keychain | Integration test against a real adapter binary; manual run on each OS | No — a clean-looking diff here is the trap |

The strategic consequence: **roughly 70% of this app lives in 🟢, and that's by design.** The Projection and Gap-Filling engines — your actual moat — are pure functions. The un-reviewable 🔴 zone is deliberately compressed to "the ACP host and nothing else." Spend your scarce careful-review attention on 🟡 and 🔴; let the tests carry 🟢.

### How to prompt the build (so diffs stay reviewable)

- **Demand the test first, in the same turn.** For any 🟢/🟡 work: "write the round-trip test, show it failing, then make it pass." You review the *test* (is it asserting the right thing?) — which is far easier to read than the implementation — and then the green check is your proof. This flips the burden from "can I spot the bug in this code?" to "does this test describe correct behavior?", which plays to your strengths.
- **Keep diffs small enough to actually read.** One projector per turn, not "build the Projection Engine." A diff over ~150 lines in a 🟡/🔴 zone is a diff you're rubber-stamping, not reviewing. Split it.
- **Make the agent state its assumptions before coding the 🔴 parts.** "Before writing the ACP host, list the JSON-RPC message types you'll handle and what happens on a malformed frame." You can review *that* reasoning even when you can't review the concurrency.
- **Never let an agent refactor the frozen core casually.** Once the ACP host's integration test is green, changes to it require the same "test first, run it for real" ritual — not a drive-by "I cleaned this up." Most regressions in this app will come from an agent helpfully touching 🔴 code you'd stopped watching.

### Verification you can run, not just read

Because diff-review fails on the hard parts, lean on artifacts that *execute*:
- **A golden-config fixture set** — real `.mcp.json`, `config.toml`, `.cursorrules` from actual installs, committed as test fixtures. Every projector change runs against them. This is your single highest-leverage safety net; build it at M3 and never delete from it.
- **A live smoke script** — spawns each agent adapter, sends one canned prompt, asserts a response shape. Run it after any 🔴 change. This is the only thing that catches transport regressions.
- **JSON Schema on every skill output** — the Profile Skill emits JSON; validate it against a strict schema at the boundary and reject non-conforming output. This stops a loose-JSON bug from silently corrupting the merge downstream.

### Where to spend a human (or a careful manual pass)

Three places where vibecoding alone is genuinely risky and you should slow down or get a second set of eyes:
1. **The ACP host's error/timeout handling** — a hung subprocess with no timeout will look fine in every demo and freeze in real use.
2. **The profile merge weighting** — silent-wrong, not loud-wrong; a subtly bad weight produces a believable but inaccurate profile, which is exactly the trust-killer the product can't afford.
3. **Secrets handling** — the one place a bug is a security incident, not an inconvenience. The plan already routes secrets to the OS keychain and never inlines them; verify that path by trying to grep a generated config for a token and finding nothing.

### Realistic cadence

Don't build engines in full before integrating. Build the *thinnest vertical slice* through all layers first (M1: one agent, one prompt, one diff, end to end), because that's what surfaces the 🔴 problems while they're cheap. Only after the spine runs do you fan out into the 🟢 engines, where progress is fast and safe and you can let agents run with longer leashes. The temptation will be to start with the satisfying pure-function projectors; resist it — they're the easy 70% and they'll still be easy after the hard 30% is proven.

---

## 7. Honest risks / where to set expectations

1. **Memory is bridged, not migrated.** The single most important truth to communicate in-product. Get the handoff digest quality high and the framing honest, and this becomes a strength; hide it and the app feels like it loses state.
2. **Instructions drift.** Same rules, slightly different behavior per agent. Label it.
3. **Cursor's ACP support is the weakest leg.** Don't let the foundation depend on it.
4. **Adapters move fast.** Treat every native format as a projection target that can change — keep projectors small and swappable, never bake a vendor schema into the core.
5. **The "do everything" scope is wide; the *differentiated* core is narrow.** Skills and AGENTS.md are already cross-agent; MCP projection is a known pattern. Your genuine moat is now threefold: (a) the unified runtime shell, (b) the Handoff Bridge, and (c) the **cross-agent Vibe-Coder Profile + Workflow Continuity Report** — the last being the only one of the three that nothing else on the market does, since no vendor compares usage across all three tools. Make those three excellent; treat the rest as table stakes you execute cleanly.
6. **The profile layer lives or dies on trust.** It must stay local-first and opt-in. It also must be honest about lopsided data quality across agents and about `/insights`'s own occasional inaccuracy. Over-claim here and it reads as a vanity gimmick; under-promise and verify, and it becomes the reason people choose your app.
7. **The build's hard 30% resists diff-review.** The ACP host and the merge logic fail at runtime, not on the page, so a vibecoding approach that trusts clean diffs will ship silent bugs precisely there. Mitigation: the 🔴/🟡/🟢 trust-zone discipline and execution-based verification in §6b — tests that run, not diffs that look right. This is a *process* risk, not a code risk, and it's the most likely thing to actually sink the build.

---

## 8. What to decide before writing code

- Canonical store shape: SQLite + on-disk canonical files, or files-only with a git-style history?
- Handoff digest source: outgoing agent vs. a dedicated cheap summarizer model (cost vs. fidelity)?
- Scope of v1 "knowledge base": just AGENTS.md + instructions, or a richer doc store you also project?
- Profile depth vs. run cost: how much history should the skill analyze per run (more = richer, more unique profile, but slower/more tokens on the user's own plan)? Default window and a "deep scan" option?
- Comparative/aggregated profiles and the third-party skill-matching marketplace: in-scope for the product vision, or explicitly deferred until the single-user cross-agent profile proves valuable?
