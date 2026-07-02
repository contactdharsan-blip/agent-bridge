import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPreset, loadPresets, resolvePresetDecision, savePresets } from "./permissionPresets";

// A minimal Map-backed Storage so the test doesn't depend on jsdom's origin-gated
// localStorage — mirrors persist.test.ts's stub exactly.
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

describe("resolvePresetDecision", () => {
  it('asks every time under the "default" preset', () => {
    expect(resolvePresetDecision("default", "editHunk")).toBe("ask");
  });

  it('auto-accepts an edit hunk under the "acceptEdits" preset', () => {
    expect(resolvePresetDecision("acceptEdits", "editHunk")).toBe("accept");
  });
});

describe("getPreset", () => {
  it('defaults an unconfigured project to "default"', () => {
    expect(getPreset({}, "/some/project")).toBe("default");
  });

  it("returns the configured preset for a known project", () => {
    expect(getPreset({ "/proj": "acceptEdits" }, "/proj")).toBe("acceptEdits");
  });

  it("keys strictly by cwd — one project's preset never leaks to another", () => {
    expect(getPreset({ "/proj-a": "acceptEdits" }, "/proj-b")).toBe("default");
  });
});

describe("permission preset persistence", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemStorage()));

  it("round-trips a preset map through storage", () => {
    savePresets({ "/proj": "acceptEdits", "/other": "default" });
    expect(loadPresets()).toEqual({ "/proj": "acceptEdits", "/other": "default" });
  });

  it("returns an empty map when nothing is stored", () => {
    expect(loadPresets()).toEqual({});
  });
});
