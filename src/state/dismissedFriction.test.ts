import { beforeEach, describe, expect, it, vi } from "vitest";
import { dismissFriction, getDismissedFriction, isFrictionDismissed, undismissFriction } from "./dismissedFriction";

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

describe("dismissedFriction", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemStorage()));

  it("starts empty", () => {
    expect(getDismissedFriction()).toEqual([]);
    expect(isFrictionDismissed("retryLoop")).toBe(false);
  });

  it("dismissing adds the pattern and it reads as dismissed", () => {
    dismissFriction("retryLoop");
    expect(getDismissedFriction()).toEqual(["retryLoop"]);
    expect(isFrictionDismissed("retryLoop")).toBe(true);
    expect(isFrictionDismissed("toolMisfire")).toBe(false);
  });

  it("dismissing the same pattern twice doesn't duplicate it", () => {
    dismissFriction("retryLoop");
    dismissFriction("retryLoop");
    expect(getDismissedFriction()).toEqual(["retryLoop"]);
  });

  it("undismissing removes it — never a one-way, silent black hole", () => {
    dismissFriction("retryLoop");
    dismissFriction("toolMisfire");
    undismissFriction("retryLoop");
    expect(getDismissedFriction()).toEqual(["toolMisfire"]);
    expect(isFrictionDismissed("retryLoop")).toBe(false);
  });
});
