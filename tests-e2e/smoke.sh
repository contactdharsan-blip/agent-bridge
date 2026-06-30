#!/usr/bin/env bash
# Live smoke test (plan §6b): spawn a real adapter, send one canned prompt, assert
# a sane response shape. Run after any 🔴 (transport) change. Exits non-zero on
# failure. Requires Node >= 22 and the relevant API key in the environment.
#
#   ANTHROPIC_API_KEY=sk-... tests-e2e/smoke.sh claude
#   OPENAI_API_KEY=sk-...    tests-e2e/smoke.sh codex
set -euo pipefail

AGENT="${1:-claude}"

# Preconditions, with clear skip messages (skip, never a false pass).
if ! command -v node >/dev/null 2>&1; then
  echo "SKIP: node not found (need Node >= 22 for the npx adapters)" >&2
  exit 0
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "SKIP: node $NODE_MAJOR < 22" >&2
  exit 0
fi

case "$AGENT" in
  claude) [ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "SKIP: ANTHROPIC_API_KEY not set" >&2; exit 0; } ;;
  codex)  [ -n "${OPENAI_API_KEY:-}" ]    || { echo "SKIP: OPENAI_API_KEY not set" >&2; exit 0; } ;;
  *) echo "usage: smoke.sh [claude|codex]" >&2; exit 2 ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
exec cargo run --quiet -p acp-host --example smoke -- "$AGENT"
