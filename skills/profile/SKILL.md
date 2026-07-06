---
name: agent-bridge-profile
description: Analyze THIS agent's local session history and emit a strict CoderProfile JSON for Agent Bridge's cross-agent coder profile. Use when the user runs an Agent Bridge profile scan, or asks "profile how I code" / "build my coder profile".
---

# Agent Bridge — Profile Skill

You are the **data-gathering instrument** for Agent Bridge's cross-agent coder
profile. Your one job: read the local session history of the agent you are
running inside, and emit a single **strict JSON** document matching the
`CoderProfile` schema (`coder_profile.schema.json`, next to this file). The same
skill runs in Claude Code, Codex, and Cursor, so the *same* taxonomy and the
*same* output contract apply everywhere — that is what makes the three profiles
comparable. Do not invent an HTML report; do not write prose; emit JSON only.

## Hard rules (read first)

- **Output is JSON and nothing else.** No markdown fences, no commentary before
  or after. The host app validates your output against the schema and *rejects*
  anything that doesn't conform (unknown keys, wrong enum, out-of-range number).
- **Local-first, privacy-hard.** Read only local history. **Never** include raw
  transcripts or source code. `evidenceExamples` and `repeatedPhrasings` are
  *short, anonymized* snippets (a phrase, not a paragraph; redact paths, names,
  secrets). Aggregate only.
- **Closed taxonomy.** Categorical fields MUST use the exact enum values in the
  schema. If something doesn't fit, use `other` — never coin a new value.
- **Be honest about coverage.** Fill `data` (`sessionsAnalyzed`, `daysCovered`,
  `messagesAnalyzed`) from what you actually read. Thin history → small numbers;
  the app weights confidence by these. Do not pad them.

## Step 1 — Find your local history

Determine which agent you are and read its native history:

| If you are… | Read |
|---|---|
| Claude Code | `~/.claude/projects/` (per-project session transcripts, ~30 days) |
| Codex | `~/.codex/sessions/` and `~/.codex/archived_sessions/` (JSONL) |
| Cursor | the local history Cursor exposes (lowest fidelity — say so via small `data` counts) |

A helper is provided: `scripts/gather_history.py` prints a JSON manifest
(available sources, file counts, date range) so you can compute `data` without
re-walking the tree. Run it if a Python 3 interpreter is available; otherwise
list the directory yourself. Set `agent` to your own host (`claude` / `codex` /
`cursor`).

## Step 2 — Extract richly (rich extraction is the whole game)

The more distinct signal you capture, the more the profile reads as a mirror of
*this specific person* rather than a template. For the window you can see:

- **task_mix** — classify each session/turn into the closed `TaskCategory` set
  and emit each category's fraction (fractions must sum to ~1.0).
- **friction_points** — recurring trouble, tagged with the closed
  `FrictionPattern` set, each with 1–3 short anonymized `evidenceExamples`, the
  `whichAgent`, and a `frequency`.
- **repeated_instructions** — instructions the user types again and again; for
  each, a `candidateRule` that would encode the habit so they needn't repeat it.
- **tool_usage** — counts of `edit` / `bash` / `mcpCalls` / `web` / `read`.
- **efficiency** — `abandonedSessions`, `retryLoops`, `contextBloatEvents`,
  `cacheReuseRatio` (0..1).
- **strengths** — what this person reliably does well.
- **agent_affinity** — for each task type, which agent they reach for + a
  confidence. (Inside a single agent you may only have evidence for that agent;
  that's fine — emit what you observe.)
- **signatures** — the fingerprint: `repeatedPhrasings`, `peakHours` (0–23),
  `abandonPersist`, `sessionRhythm`, `avgSessionMinutes`. Over-collect here.

## Step 3 — Emit + self-check

Emit the JSON. Before returning, verify against `coder_profile.schema.json`:
`schemaVersion` = 1, every categorical field is an allowed enum, every fraction
and ratio is in `[0,1]`, `taskMix` fractions sum to ~1.0, `peakHours` are 0–23.
A worked, schema-valid example is in `example_output.json` — match its shape
exactly (different numbers, same structure).

Return the JSON as your final message and stop.
