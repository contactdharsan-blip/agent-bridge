import { describe, expect, it } from "vitest";
import { matches } from "./CommandPalette";

describe("command palette fuzzy match", () => {
  it("matches everything on an empty query", () => {
    expect(matches("Go to Config", "")).toBe(true);
  });

  it("matches a case-insensitive subsequence", () => {
    expect(matches("Go to Config", "gcfg")).toBe(true);
    expect(matches("Cancel current turn", "cancel")).toBe(true);
  });

  it("rejects characters that are out of order or absent", () => {
    expect(matches("Go to Config", "zzz")).toBe(false);
    expect(matches("Go to Config", "gfcg")).toBe(false);
  });
});
