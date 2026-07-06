// FR25 (auto-reproject on change): tracks the on-disk content we last
// confirmed as "ours" for a given (cwd, fileKey) native file — an MCP config
// or a projected instructions doc — so a drift/overwrite check can tell
// "differs because canonical moved on since our own last write" (safe to
// auto-regenerate) apart from "differs because a human hand-edited the file
// out of band" (must never be auto-clobbered — the drift guard's whole
// point, FR11/UI-FR14). Neither the pure Rust drift check nor the
// InstructionsPreview comparison have any memory of what they last wrote;
// this is the frontend-side memory that makes the distinction possible
// without weakening either guard. `fileKey` is just a stable per-file
// identifier — the projection `Target` for MCP config, the artifact's own
// `path` (e.g. "CLAUDE.md") for instructions.

import { load, save } from "./persist";

function key(cwd: string, fileKey: string): string {
  return `nativeFileFingerprint.${cwd}.${fileKey}`;
}

/** The on-disk content we last confirmed as ours for this (cwd, fileKey), or
 * `null` if we've never recorded one (a hand-edit can't be ruled out yet). */
export function getFingerprint(cwd: string, fileKey: string): string | null {
  return load<string | null>(key(cwd, fileKey), null);
}

/** Record `contents` as confirmed-ours — call after a successful write, or
 * after observing the on-disk file already matches the projection (whoever
 * wrote it last). */
export function setFingerprint(cwd: string, fileKey: string, contents: string): void {
  save(key(cwd, fileKey), contents);
}
