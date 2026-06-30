# Lessons

Format: `[date] | what went wrong | rule to prevent it`

2026-06-30 | (baseline) | Pure crates verify with `cargo test -p <crate>` and only pull serde-tier deps — never build `src-tauri` (heavy webkit tree) just to check a projector. Disk is tight (~13Gi).
2026-06-30 | (baseline) | Repo git identity is `contactdharsan@gmail.com` (repo `git config user.email`), NOT the `kesavand@gmail.com` in the session reminder. Commit as the repo identity; never override.
2026-06-30 | (baseline) | The 🔴 `acp-host` crate + its tests are frozen. New work goes in new pure crates depending only on plain owned data — never import `agent_client_protocol` outside `acp-host`.
2026-06-30 | env-var tests are racy under cargo's parallel runner | Don't assert on a process-wide env var another test reads (e.g. CURSOR_ACP_COMMAND): assert robust properties (command non-empty) instead of the exact default, or the override default flips under concurrency.
2026-06-30 | bidirectional projectors prove themselves | A pure projector is only 🟢-verifiable if it also parses: `parse(project(parse(x))) == parse(x)` shows no field is dropped, formatting-independent. Always ship the inverse with the projector.
2026-06-30 | `tsc`/Tauri context need their prerequisites | `npm run typecheck` needs `npm install` first; `cargo check -p agent-bridge` needs `dist/` (run `npm run build`) because `generate_context!` embeds frontend assets at compile time.
