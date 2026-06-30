# Agent adapters (development)

Agent Bridge spawns each agent's **ACP adapter** as a subprocess. For M1/M2 the
adapters are run via `npx` (they are Node packages, **Node ≥ 22 required**); no
binary is bundled yet (true bundling is an M7 concern).

The registry (`crates/acp-host/src/registry.rs`) launches:

| Agent  | Command                                            | Auth (env)          |
|--------|----------------------------------------------------|---------------------|
| claude | `npx -y @zed-industries/claude-code-acp@latest`    | `ANTHROPIC_API_KEY` |
| codex  | `npx -y @zed-industries/codex-acp@latest`          | `OPENAI_API_KEY`    |

The first `npx` run downloads the package (can take 20–40s — covered by the
host's 60s startup timeout). Export the relevant API key before launching so the
adapter can authenticate (bring-your-own key; nothing is stored by the app).

To trace the raw ACP wire traffic during development, set
`AGENT_BRIDGE_DEBUG_FRAMES=1` and watch stderr.
