# Agent adapters (development)

Agent Bridge spawns each agent's **ACP adapter** as a subprocess. The
fallback path (always available, used whenever vendored resources aren't
present — e.g. a dev build) runs the adapters via `npx` (they are Node
packages, **Node ≥ 22 required**).

The registry (`crates/acp-host/src/registry.rs`) launches:

| Agent  | Command                                                    | Auth (env)          |
|--------|-------------------------------------------------------------|---------------------|
| claude | `npx -y @agentclientprotocol/claude-agent-acp@latest`       | `ANTHROPIC_API_KEY` |
| codex  | `npx -y @agentclientprotocol/codex-acp@latest`              | `OPENAI_API_KEY`    |

(Package names updated 2026-07-06 — the previous `@zed-industries/*` packages
were renamed upstream and are now frozen/deprecated.)

The first `npx` run downloads the package (can take 20–40s — covered by the
host's 60s startup timeout). Export the relevant API key before launching so the
adapter can authenticate (bring-your-own key; nothing is stored by the app).

## True bundling (NFR4)

`scripts/vendor-adapters.sh` fetches a portable Node runtime + `npm install`s
the two packages above into `src-tauri/vendor/` (gitignored — binaries, not
source; ~600MB for both platforms' worth of packages plus the Node runtime).
`tauri.conf.json`'s `bundle.resources` bundles that directory into the
packaged app; `src-tauri/src/vendored_adapters.rs` resolves it at runtime
(`commands::start_session`) and, when present, launches the vendored
`node` + package directly — no system Node/npx involved at all. The `npx`
path above is the fallback whenever vendored resources aren't found (a dev
build, or a platform the script hasn't been run for) — it's never removed,
so nothing regresses if vendoring is skipped.

Run `bash scripts/vendor-adapters.sh` before `npm run tauri build` to
populate it (wired into `.github/workflows/desktop-build.yml` already). Both
vendored adapters were execution-verified for real during development: the
actual `AcpHostHandle` transport completed a live ACP handshake
(`initialize` + `session/new`) against each vendored `node`+package pair with
no system Node/npx and no API key (auth is only checked later, at prompt
time) — proving the vendored artifacts are genuinely runnable, not just
present on disk.

To trace the raw ACP wire traffic during development, set
`AGENT_BRIDGE_DEBUG_FRAMES=1` and watch stderr.
