#!/usr/bin/env bash
# NFR4 "no-install agents": fetch a portable Node runtime + the two ACP
# adapter npm packages into src-tauri/vendor/, so a packaged release build
# can launch them directly (no system Node/npx required at all). This is a
# true-bundling addition, not a replacement — registry.rs's npx-based
# AdapterSpec stays the fallback whenever vendor/ is absent (dev builds, or a
# platform this script hasn't been run for), so nothing regresses.
#
# Not wired into `beforeBuildCommand` (which fires on every `tauri dev`/
# `cargo check`) — that would force a ~150MB network fetch on ordinary local
# dev/test runs. Run this explicitly before packaging (`npm run vendor` or
# directly), and wire it into CI immediately before `tauri build` there.
#
# Package names mirror crates/acp-host/src/registry.rs's adapter_for exactly
# — keep both in sync if either changes.
set -euo pipefail

NODE_VERSION="24.18.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$SCRIPT_DIR/../src-tauri/vendor"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

detect_platform() {
  local os arch os_name arch_name
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin) os_name="darwin" ;;
    Linux) os_name="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os_name="win" ;;
    *) echo "vendor-adapters: unsupported OS: $os" >&2; exit 1 ;;
  esac
  case "$arch" in
    arm64|aarch64) arch_name="arm64" ;;
    x86_64|amd64) arch_name="x64" ;;
    *) echo "vendor-adapters: unsupported arch: $arch" >&2; exit 1 ;;
  esac
  echo "${os_name}-${arch_name}"
}

PLATFORM="$(detect_platform)"
echo "==> Vendoring for platform: $PLATFORM (Node v${NODE_VERSION})"

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR/node/bin" "$VENDOR_DIR/adapters"

# --- 1. Node runtime: extract the full official tarball to scratch, then
#        keep only the `node` binary itself — everything else in the
#        official distribution (npm, docs, headers) is dead weight here,
#        since the adapters are invoked as `node <script>` directly, never
#        via npm/npx. ------------------------------------------------------
if [[ "$PLATFORM" == win-* ]]; then
  ARCHIVE="node-v${NODE_VERSION}-${PLATFORM}.zip"
  curl -fsSL -o "$WORK_DIR/$ARCHIVE" "https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"
  unzip -q "$WORK_DIR/$ARCHIVE" -d "$WORK_DIR"
  cp "$WORK_DIR/node-v${NODE_VERSION}-${PLATFORM}/node.exe" "$VENDOR_DIR/node/node.exe"
else
  ARCHIVE="node-v${NODE_VERSION}-${PLATFORM}.tar.gz"
  curl -fsSL -o "$WORK_DIR/$ARCHIVE" "https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"
  tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
  cp "$WORK_DIR/node-v${NODE_VERSION}-${PLATFORM}/bin/node" "$VENDOR_DIR/node/bin/node"
  chmod +x "$VENDOR_DIR/node/bin/node"
fi
echo "==> Node runtime vendored ($(du -sh "$VENDOR_DIR/node" | cut -f1))"

# --- 2. Adapter packages — installed into their own throwaway package.json
#        so npm resolves each package's own dependency tree independently. -
declare -a AGENTS=(claude codex)
declare -a PACKAGES=("@agentclientprotocol/claude-agent-acp" "@agentclientprotocol/codex-acp")

for i in "${!AGENTS[@]}"; do
  agent="${AGENTS[$i]}"
  pkg="${PACKAGES[$i]}"
  dir="$VENDOR_DIR/adapters/$agent"
  mkdir -p "$dir"
  (
    cd "$dir"
    npm init -y >/dev/null
    npm install "${pkg}@latest" --omit=dev --no-audit --no-fund >/dev/null
  )
  bin_path=$(cd "$dir" && npm bin 2>/dev/null || echo "$dir/node_modules/.bin")
  echo "==> Vendored $pkg into $dir ($(du -sh "$dir" | cut -f1)); bin dir: $bin_path"
done

echo "==> Done. Total vendor size: $(du -sh "$VENDOR_DIR" | cut -f1)"
