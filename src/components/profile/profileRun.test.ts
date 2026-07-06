import { describe, expect, it } from "vitest";
import type { CoderProfile } from "../../engineTypes";
import { buildProfilePrompt, DEFAULT_PROFILE_DEPTH, dominantProfile, extractJson } from "./profileRun";

function profile(agent: string, messagesAnalyzed: number): CoderProfile {
  return { agent, data: { messagesAnalyzed } } as unknown as CoderProfile;
}

describe("extractJson", () => {
  it("pulls the object out of a chatty reply", () => {
    expect(extractJson('Here you go: {"a":1} — done')).toBe('{"a":1}');
  });

  it("spans from the first { to the last }", () => {
    expect(extractJson('x {"a":{"b":2}} y')).toBe('{"a":{"b":2}}');
  });

  it("returns null when there is no object", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("}{")).toBeNull();
  });
});

describe("buildProfilePrompt (FR40)", () => {
  it("defaults to the cheaper recent scan", () => {
    expect(DEFAULT_PROFILE_DEPTH).toBe("recent");
    expect(buildProfilePrompt()).toBe(buildProfilePrompt("recent"));
  });

  it("asks for a recent, bounded window by default", () => {
    expect(buildProfilePrompt("recent")).toMatch(/recent/i);
    expect(buildProfilePrompt("recent")).not.toMatch(/as much.*as you can/i);
  });

  it("asks for everything available on deep scan, unbounded", () => {
    expect(buildProfilePrompt("deep")).toMatch(/as much.*as you can/i);
  });

  it("still emits the same schema contract regardless of depth", () => {
    for (const depth of ["recent", "deep"] as const) {
      const p = buildProfilePrompt(depth);
      expect(p).toMatch(/CoderProfile JSON/);
      expect(p).toMatch(/schemaVersion/);
      expect(p).toMatch(/Output ONLY the JSON object/);
    }
  });
});

describe("dominantProfile", () => {
  it("returns null for an empty set", () => {
    expect(dominantProfile([])).toBeNull();
  });

  it("picks the profile with the most analyzed messages", () => {
    const a = profile("claude", 10);
    const b = profile("codex", 42);
    const c = profile("cursor", 5);
    expect(dominantProfile([a, b, c])).toBe(b);
  });
});
