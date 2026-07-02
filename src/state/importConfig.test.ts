import { describe, expect, it } from "vitest";
import type { McpServer } from "../engineTypes";
import { mergeImportedServers } from "./importConfig";

function server(name: string, command: string): McpServer {
  return {
    name,
    transport: { transport: "stdio", command, args: [], env: [] },
    disabled: false,
  };
}

describe("mergeImportedServers", () => {
  it("returns the imported list unchanged when there is no existing canonical state", () => {
    const imported = [server("gh", "gh-mcp"), server("fs", "fs-mcp")];
    expect(mergeImportedServers([], imported)).toEqual(imported);
  });

  it("returns the existing list unchanged when nothing was imported", () => {
    const existing = [server("gh", "gh-mcp")];
    expect(mergeImportedServers(existing, [])).toEqual(existing);
  });

  it("appends new imported servers that don't collide by name", () => {
    const existing = [server("gh", "gh-mcp")];
    const imported = [server("fs", "fs-mcp")];
    expect(mergeImportedServers(existing, imported)).toEqual([
      server("gh", "gh-mcp"),
      server("fs", "fs-mcp"),
    ]);
  });

  it("imported wins on a name conflict, replacing the canonical entry in place", () => {
    const existing = [server("gh", "old-command"), server("fs", "fs-mcp")];
    const imported = [server("gh", "new-command")];
    const merged = mergeImportedServers(existing, imported);
    expect(merged).toEqual([server("gh", "new-command"), server("fs", "fs-mcp")]);
    // Confirms it's an in-place replace, not append-then-orphan: still exactly 2 entries.
    expect(merged).toHaveLength(2);
  });

  it("dedupes duplicate names within the imported list itself, last one winning", () => {
    const imported = [server("gh", "first"), server("gh", "second")];
    const merged = mergeImportedServers([], imported);
    expect(merged).toEqual([server("gh", "second")]);
  });
});
