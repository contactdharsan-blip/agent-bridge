import { describe, expect, it } from "vitest";
import { estimateTokens, formatTokens } from "./tokenEstimate";

describe("estimateTokens", () => {
  it("returns 0 for empty text — nothing sent, nothing estimated", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("never reports 0 for non-empty text", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("hi")).toBe(1);
  });

  it("uses the ~4 chars/token heuristic, rounding up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("x".repeat(400))).toBe(100);
    expect(estimateTokens("x".repeat(401))).toBe(101);
  });

  it("counts whitespace — it costs tokens too", () => {
    expect(estimateTokens("        ")).toBe(2);
  });
});

describe("formatTokens", () => {
  it("keeps small counts exact", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("abbreviates thousands with one decimal under 10k", () => {
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(9950)).toBe("10k");
  });

  it("drops the decimal at 10k and above", () => {
    expect(formatTokens(25400)).toBe("25k");
  });
});
