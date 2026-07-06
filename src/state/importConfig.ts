// Pure merge logic for the import wizard (FR26): folding MCP servers parsed
// from an existing native config back into the canonical store. Kept separate
// from the IPC orchestration (reading files, parsing per target) so the
// dedupe rule is a plain, hermetically-testable function.

import { INSTRUCTIONS_FILE, TARGET_FILE } from "../components/config/targets";
import { parseNativeMcp, readNativeFile } from "../engines";
import type { McpServer, Target } from "../engineTypes";
import type { ToastKind } from "./toast";

/**
 * Merge freshly-imported servers into the existing canonical list, deduping
 * by `name`. Imported wins on a name conflict — the whole point of importing
 * is to bring the canonical store in line with what's actually on disk, so a
 * same-named canonical entry that predates the import should not silently
 * shadow it. Relative order is preserved: existing servers keep their
 * position (updated in place on conflict), new imported servers are appended
 * in the order they appear in `imported`.
 */
export function mergeImportedServers(existing: McpServer[], imported: McpServer[]): McpServer[] {
  const byName = new Map<string, McpServer>();
  for (const server of existing) byName.set(server.name, server);
  for (const server of imported) byName.set(server.name, server);
  return Array.from(byName.values());
}

// The three MCP targets read in a fixed order — later targets win on a
// server-name conflict (same "imported wins" rule as `mergeImportedServers`,
// applied transitively as each target's result becomes the next one's
// "existing"). Same order used for picking which instructions file wins.
const IMPORT_TARGETS: Target[] = ["claude", "codex", "cursor"];

/**
 * Single-click import wizard (FR26): read whichever of the three native MCP
 * configs exist under `cwd`, parse + merge them into the canonical server
 * list, and take the first non-empty native instructions file found into the
 * canonical instructions doc. Best-effort — a target with no file, or one
 * that fails to parse, is skipped (and reported via `toast`) rather than
 * aborting the whole import.
 */
export async function runImportWizard(params: {
  cwd: string;
  servers: McpServer[];
  /** Current canonical instructions — a non-empty, differing doc is never
   * silently replaced (the app blocks every disk write behind a review; its
   * own source of truth deserves the same protection). */
  instructions: string;
  setServers: (next: McpServer[]) => void;
  setInstructions: (markdown: string) => void;
  toast: (kind: ToastKind, text: string) => void;
}): Promise<{ imported: boolean }> {
  const { cwd, servers, instructions, setServers, setInstructions, toast } = params;
  if (!cwd.trim()) {
    toast("info", "Set a working directory before importing an existing config");
    return { imported: false };
  }

  let merged = servers;
  let importedServers = false;
  for (const target of IMPORT_TARGETS) {
    const path = TARGET_FILE[target];
    try {
      const raw = await readNativeFile(cwd, path);
      if (raw === null) continue;
      const parsed = await parseNativeMcp(target, raw);
      if (parsed.length === 0) continue;
      merged = mergeImportedServers(merged, parsed);
      importedServers = true;
    } catch (e) {
      toast("info", `Skipped ${path} — couldn't read/parse it (${String(e)})`);
    }
  }
  if (importedServers) setServers(merged);

  let importedInstructions: string | null = null;
  let keptInstructions: string | null = null;
  for (const target of IMPORT_TARGETS) {
    const path = INSTRUCTIONS_FILE[target];
    try {
      const raw = await readNativeFile(cwd, path);
      if (raw && raw.trim()) {
        if (instructions.trim() && instructions.trim() !== raw.trim()) {
          // Canonical already holds a different doc — keep it and say so,
          // rather than clobbering the source of truth unreviewed.
          keptInstructions = path;
        } else {
          setInstructions(raw);
          importedInstructions = path;
        }
        break;
      }
    } catch {
      // Best-effort: instruction-file read errors are quietly skipped — MCP
      // import above already surfaces read/parse failures loudly.
    }
  }

  if (importedInstructions) toast("success", `Imported instructions from ${importedInstructions}`);
  if (keptInstructions) {
    toast(
      "info",
      `Kept your canonical instructions — ${keptInstructions} differs; replace them by hand in Config if the on-disk version should win`,
    );
  }
  if (importedServers || importedInstructions) {
    toast("success", "Imported existing native config into the canonical store");
  } else if (!keptInstructions) {
    toast("info", `No existing native config files found under ${cwd}`);
  }
  return { imported: importedServers || importedInstructions !== null };
}
