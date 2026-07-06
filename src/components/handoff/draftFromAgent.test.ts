import { describe, expect, it } from "vitest";
import { draftFieldNames, parseSnapshotDraft } from "./draftFromAgent";

const VALID = {
  conversationSummary: "Ported the projector and fixed the round-trip test.",
  taskList: [
    { text: "port projector", status: "completed" },
    { text: "wire drift check", status: "inProgress" },
  ],
  decisions: ["keep TOML keys sorted"],
  openFiles: ["src/lib.rs"],
  recentEdits: [{ file: "src/lib.rs", hunkSummary: "sorted keys" }],
};

describe("parseSnapshotDraft", () => {
  it("parses a clean JSON reply", () => {
    const d = parseSnapshotDraft(JSON.stringify(VALID))!;
    expect(d.conversationSummary).toBe(VALID.conversationSummary);
    expect(d.taskList).toHaveLength(2);
    expect(d.decisions).toEqual(["keep TOML keys sorted"]);
    expect(d.openFiles).toEqual(["src/lib.rs"]);
    expect(d.recentEdits).toEqual([{ file: "src/lib.rs", hunkSummary: "sorted keys" }]);
  });

  it("extracts the object out of a chatty reply", () => {
    const d = parseSnapshotDraft(`Sure! Here you go:\n${JSON.stringify(VALID)}\nAnything else?`)!;
    expect(d.conversationSummary).toBe(VALID.conversationSummary);
  });

  it("returns null when there is no JSON at all", () => {
    expect(parseSnapshotDraft("I can't do that.")).toBeNull();
    expect(parseSnapshotDraft("")).toBeNull();
    expect(parseSnapshotDraft("{ not json }")).toBeNull();
  });

  it("returns null for a JSON array or scalar root", () => {
    // extractJson finds no object braces in a bare array/scalar reply.
    expect(parseSnapshotDraft("[1,2,3]")).toBeNull();
  });

  it("drops tasks with a status outside the closed enum instead of coercing", () => {
    const d = parseSnapshotDraft(
      JSON.stringify({
        taskList: [
          { text: "ok", status: "pending" },
          { text: "made-up", status: "almostDone" },
          { text: "missing status" },
        ],
      }),
    )!;
    expect(d.taskList).toEqual([{ text: "ok", status: "pending" }]);
  });

  it("drops non-string list entries and blank strings", () => {
    const d = parseSnapshotDraft(
      JSON.stringify({ decisions: ["real", 42, null, "   ", { a: 1 }] }),
    )!;
    expect(d.decisions).toEqual(["real"]);
  });

  it("omits fields that end up empty after validation", () => {
    const d = parseSnapshotDraft(JSON.stringify({ decisions: [42], openFiles: [] }))!;
    expect(d.decisions).toBeUndefined();
    expect(d.openFiles).toBeUndefined();
  });

  it("caps list sizes and string lengths", () => {
    const d = parseSnapshotDraft(
      JSON.stringify({
        conversationSummary: "x".repeat(5000),
        decisions: Array.from({ length: 50 }, (_, i) => `d${i}`),
      }),
    )!;
    expect(d.conversationSummary!.length).toBe(2000);
    expect(d.decisions).toHaveLength(20);
  });

  it("keeps edits with a file but tolerates a missing hunkSummary", () => {
    const d = parseSnapshotDraft(
      JSON.stringify({ recentEdits: [{ file: "a.ts" }, { hunkSummary: "no file" }] }),
    )!;
    expect(d.recentEdits).toEqual([{ file: "a.ts", hunkSummary: "" }]);
  });
});

describe("draftFieldNames", () => {
  it("reports exactly what a draft would fill", () => {
    const d = parseSnapshotDraft(JSON.stringify(VALID))!;
    expect(draftFieldNames(d)).toEqual([
      "summary",
      "2 task(s)",
      "1 decision(s)",
      "1 open file(s)",
      "1 edit(s)",
    ]);
    expect(draftFieldNames({})).toEqual([]);
  });
});
