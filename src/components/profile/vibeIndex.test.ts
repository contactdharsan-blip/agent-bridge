import { describe, expect, it } from "vitest";
import type { MergedProfile } from "../../engineTypes";
import { computeVibeIndex } from "./vibeIndex";

function merged(overrides: Partial<MergedProfile> = {}): MergedProfile {
  return {
    agents: [
      { agent: "claude", weight: 0.7, confidence: 0.8 },
      { agent: "codex", weight: 0.3, confidence: 0.4 },
    ],
    taskMix: [
      { category: "refactor", fraction: 0.6 },
      { category: "debug", fraction: 0.4 },
    ],
    frictionPoints: [],
    repeatedInstructions: [],
    toolUsageByAgent: [],
    strengths: ["front-loads context", "small reviewable diffs"],
    agentAffinity: [],
    signatures: {},
    ...overrides,
  };
}

describe("computeVibeIndex", () => {
  it("returns null for an empty merge", () => {
    expect(computeVibeIndex(null)).toBeNull();
    expect(computeVibeIndex(merged({ agents: [] }))).toBeNull();
  });

  it("picks the archetype for the highest-fraction task category", () => {
    const idx = computeVibeIndex(merged())!;
    expect(idx.archetype).toBe("The Refactorer");
    expect(idx.topCategory).toEqual({ category: "refactor", fraction: 0.6 });
  });

  it("falls back to the generalist archetype for an unmapped/empty task mix", () => {
    const idx = computeVibeIndex(merged({ taskMix: [] }))!;
    expect(idx.archetype).toBe("The Generalist");
    expect(idx.topCategory).toBeNull();
  });

  it("computes confidence as the weight-weighted average agent confidence, in 0-100", () => {
    // 0.7*0.8 + 0.3*0.4 = 0.68 -> 68
    const idx = computeVibeIndex(merged())!;
    expect(idx.confidence).toBe(68);
  });

  it("picks the highest-weight agent as the lead agent", () => {
    const idx = computeVibeIndex(merged())!;
    expect(idx.leadAgent).toEqual({ agent: "claude", weight: 0.7 });
  });

  it("caps traits at 3", () => {
    const idx = computeVibeIndex(
      merged({ strengths: ["a", "b", "c", "d", "e"] }),
    )!;
    expect(idx.traits).toEqual(["a", "b", "c"]);
  });

  it("does not claim a majority when the top category is only a plurality (NFR2)", () => {
    const idx = computeVibeIndex(
      merged({
        taskMix: [
          { category: "refactor", fraction: 0.3 },
          { category: "debug", fraction: 0.28 },
          { category: "tests", fraction: 0.22 },
          { category: "docs", fraction: 0.2 },
        ],
      }),
    )!;
    // The archetype label still reflects the leading category...
    expect(idx.archetype).toBe("The Refactorer");
    // ...but a 30% plurality must not read as "spends most sessions".
    expect(idx.blurb).not.toMatch(/most sessions/i);
    expect(idx.blurb).toContain("no single task category dominates");
  });

  it("does not fabricate a cross-agent lean from a single-agent profile (NFR2)", () => {
    // With one agent, weight is 1.0 by construction — a "lean" would be invented.
    const idx = computeVibeIndex(
      merged({ agents: [{ agent: "claude", weight: 1, confidence: 0.5 }] }),
    )!;
    expect(idx.leadAgent).toBeNull();
  });
});
