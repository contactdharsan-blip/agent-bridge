import type { Target } from "../../engineTypes";

// The native config file each agent reads. Kept as a single source of truth so
// the projection preview and the copy-for-placement instructions name the exact
// same path — imported by both McpPreview and DriftWrite.
export const TARGET_FILE: Record<Target, string> = {
  claude: ".mcp.json",
  codex: ".codex/config.toml",
  cursor: ".cursor/mcp.json",
};
