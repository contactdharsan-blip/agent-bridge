import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFingerprint, setFingerprint } from "./nativeFileFingerprint";

class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
}

describe("nativeFileFingerprint", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemStorage()));

  it("returns null for a (cwd, fileKey) never recorded", () => {
    expect(getFingerprint("/proj", "claude")).toBeNull();
  });

  it("round-trips a recorded fingerprint", () => {
    setFingerprint("/proj", "claude", '{"mcpServers":{}}');
    expect(getFingerprint("/proj", "claude")).toBe('{"mcpServers":{}}');
  });

  it("keeps different file keys under the same cwd independent", () => {
    setFingerprint("/proj", "claude", "claude-contents");
    setFingerprint("/proj", "CLAUDE.md", "instructions-contents");
    expect(getFingerprint("/proj", "claude")).toBe("claude-contents");
    expect(getFingerprint("/proj", "CLAUDE.md")).toBe("instructions-contents");
  });

  it("keeps the same file key under different cwds independent", () => {
    setFingerprint("/proj-a", "claude", "a-contents");
    setFingerprint("/proj-b", "claude", "b-contents");
    expect(getFingerprint("/proj-a", "claude")).toBe("a-contents");
    expect(getFingerprint("/proj-b", "claude")).toBe("b-contents");
  });

  it("overwrites a stale fingerprint on re-record", () => {
    setFingerprint("/proj", "claude", "old");
    setFingerprint("/proj", "claude", "new");
    expect(getFingerprint("/proj", "claude")).toBe("new");
  });
});
