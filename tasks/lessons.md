# Lessons

Format: `[date] | what went wrong | rule to prevent it`

2026-06-30 | (baseline) | Pure crates verify with `cargo test -p <crate>` and only pull serde-tier deps — never build `src-tauri` (heavy webkit tree) just to check a projector. Disk is tight (~13Gi).
2026-06-30 | (baseline) | Repo git identity is `contactdharsan@gmail.com` (repo `git config user.email`), NOT the `kesavand@gmail.com` in the session reminder. Commit as the repo identity; never override.
2026-06-30 | (baseline) | The 🔴 `acp-host` crate + its tests are frozen. New work goes in new pure crates depending only on plain owned data — never import `agent_client_protocol` outside `acp-host`.
