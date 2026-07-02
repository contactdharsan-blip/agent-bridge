import type { Target } from "../../engineTypes";

// The native config file each agent reads. Kept as a single source of truth so
// the projection preview and the copy-for-placement instructions name the exact
// same path — imported by both McpPreview and DriftWrite.
export const TARGET_FILE: Record<Target, string> = {
  claude: ".mcp.json",
  codex: ".codex/config.toml",
  cursor: ".cursor/mcp.json",
};

// The native instructions file each agent reads (mirrors
// `projection::instructions_path` in Rust — kept here since instructions_path
// isn't exposed via IPC and the mapping is fixed). Used by both
// InstructionsPreview (which already gets a matching `path` back from
// `preview_instructions`) and the import wizard, which needs the path before
// any preview has run.
export const INSTRUCTIONS_FILE: Record<Target, string> = {
  claude: "CLAUDE.md",
  codex: "AGENTS.md",
  cursor: ".cursorrules",
};
