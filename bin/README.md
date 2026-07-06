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

See `vendor/README.md` for the true-bundling path (NFR4): a packaged release
build ships a vendored Node runtime + these two packages under
`src-tauri/vendor/`, wired in via `tauri.conf.json`'s `bundle.resources`, so a
packaged app doesn't need the user's own Node/npx at all. The `npx` path
above is the dev-mode / vendor-missing fallback, never removed.

To trace the raw ACP wire traffic during development, set
`AGENT_BRIDGE_DEBUG_FRAMES=1` and watch stderr.
