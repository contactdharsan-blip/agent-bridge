# Operator TODO — what's left that needs *you* (the human)

This is the handoff list of tasks Claude **cannot** do autonomously: things that
need a secret, a logged-in account, a GUI/display, hardware signing, a paid
token budget, or a genuine product/business decision. The engineering backlog
that Claude *is* working through lives in `tasks/todo.md`; this file is only the
human-operator action items.

Status at time of writing: M3, M4, M5, M5b implemented + committed on branch
`agent-bridge-m3-m7`. M5c/M6/M7 in progress by Claude.

---

## 🔑 Secrets & accounts (blocking the real-adapter gates)
- [ ] Export an Anthropic key for Claude: `export ANTHROPIC_API_KEY=sk-...`
- [ ] Export an OpenAI key for Codex: `export OPENAI_API_KEY=sk-...`
- [ ] (Later) Cursor: log in via its own CLI/subscription — does not configure the others.
- [ ] Decide the durable auth path to recommend to users: **bring-your-own API key** is the plan's recommendation (plan §5; least fragile). Confirm.

## 🧰 Local toolchain (one-time)
- [ ] Node ≥ 22 installed (`node -v`) — required to fetch/run the ACP adapters via `npx`.
- [ ] Rust stable (`cargo -V`) — installed; used for the whole core.
- [ ] Linux desktop only: install Tauri system deps — `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.
- [ ] Free up disk: build host is ~97% full (~13Gi free). A full `tauri dev`/release build (webkit + full Rust tree) needs several GB. Prune `~/.cargo`/old `target/` if a Tauri build fails on space. (Pure-crate tests don't need it.)

## ▶️ Things only you can run (need keys / network / a display)
- [ ] Real-adapter gate test (proves the 🔴 transport core against live agents):
      `ANTHROPIC_API_KEY=sk-... cargo test -p acp-host --test round_trip -- --ignored --nocapture`
- [ ] Live smoke after any transport change: `ANTHROPIC_API_KEY=sk-... tests-e2e/smoke.sh claude`
- [ ] Launch the desktop app (needs a display): `npm install && npm run tauri dev`
- [ ] Run the Profile Skill for real inside Claude/Codex/Cursor against your own history and confirm the emitted JSON validates (it runs on the agent's own model — uses your plan's tokens).

## 📦 Distribution (requires paid developer identities — cannot be automated here)
- [ ] macOS: Apple Developer ID + notarization for the signed `.dmg`.
- [ ] Windows: code-signing certificate.
- [ ] Linux: AppImage/deb packaging (no signing identity needed, but a build host).
- [ ] Bundle the prebuilt ACP adapter binaries into the app (`bin/` — see `bin/README.md`) so users install no toolchain (NFR4).

## 🧠 Product / business decisions (Claude will NOT decide these — they're yours)
- [ ] **Pricing / packaging** (PRD §11): one-time vs subscription; does the profile layer anchor a paid tier?
- [ ] **Canonical store shape** (PRD §11): SQLite + files, or files-only with git-style history? (Claude shipped a files/in-memory model that a DB can wrap later — confirm the direction.)
- [ ] **v1 knowledge-base scope**: AGENTS.md + instructions only, or a richer projected doc store?
- [ ] **Comparative/aggregated profiles + third-party skill marketplace** (FR45/FR46): in v1 vision or deferred to v2? (Currently tagged deferred.)
- [ ] **Profile depth default** (FR40): default history window + whether to ship the "deep scan" option in v1.
- [ ] **Expanded feature set release tags** (PRD §13): confirm the v1 / v1.1 / v2 split Claude proposed, or re-cut scope.

## 🌐 Supply-side / curation (needs human judgment)
- [ ] Seed the Gap-Filling marketplace index (FR44) with known-good skills keyed to capability gaps — Claude can scaffold the format; you curate what's trustworthy.
- [ ] Review every generated gap-filler skill before it's offered for install (FR22b, FR42) — third-party/generated code is untrusted by policy.

## 🔁 Repo / CI
- [ ] Push branch `agent-bridge-m3-m7` and open a PR (Claude will push when the milestone run finishes; you review/merge).
- [ ] Decide CI scope: at minimum run the hermetic suite (`cargo test` for the pure crates + `acp-host` offline + `npm run typecheck/build`); the real-adapter gates stay manual (need keys).
