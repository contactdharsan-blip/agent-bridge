import { beforeEach, describe, expect, it, vi } from "vitest";
import { load, save } from "./persist";

// A minimal Map-backed Storage so the test doesn't depend on jsdom's origin-gated
// localStorage — it exercises persist.ts's own logic deterministically.
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

describe("persist", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemStorage()));

  it("round-trips a value through storage", () => {
    save("thing", { a: 1, b: ["x", "y"] });
    expect(load("thing", null)).toEqual({ a: 1, b: ["x", "y"] });
  });

  it("returns the fallback for a missing key", () => {
    expect(load("absent", "fallback")).toBe("fallback");
  });

  it("returns the fallback for corrupt JSON rather than throwing", () => {
    localStorage.setItem("agentbridge.broken", "{not json");
    expect(load("broken", 42)).toBe(42);
  });
});
