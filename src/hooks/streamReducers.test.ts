import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types";
import { appendToRole, stopNote } from "./streamReducers";

let counter = 0;
const mkId = () => ++counter;

describe("appendToRole", () => {
  it("starts a new bubble when the last message is a different role", () => {
    const start: ChatMessage[] = [{ id: 1, role: "user", text: "hi" }];
    const next = appendToRole(start, "hello", "assistant", mkId);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ role: "assistant", text: "hello" });
  });

  it("appends into the open bubble of the same role", () => {
    const start: ChatMessage[] = [{ id: 1, role: "assistant", text: "he" }];
    const next = appendToRole(start, "llo", "assistant", mkId);
    expect(next).toHaveLength(1);
    expect(next[0].text).toBe("hello");
  });

  it("keeps interleaved thought and answer in separate bubbles", () => {
    let msgs: ChatMessage[] = [];
    msgs = appendToRole(msgs, "thinking…", "thought", mkId);
    msgs = appendToRole(msgs, "answer", "assistant", mkId);
    msgs = appendToRole(msgs, " more", "assistant", mkId);
    expect(msgs.map((m) => m.role)).toEqual(["thought", "assistant"]);
    expect(msgs[1].text).toBe("answer more");
  });
});

describe("stopNote", () => {
  it("returns null for a clean end", () => {
    expect(stopNote("endTurn")).toBeNull();
  });

  it("surfaces every non-clean stop reason honestly", () => {
    expect(stopNote("cancelled")).toMatch(/cancelled/i);
    expect(stopNote("maxTokens")).toMatch(/max tokens/i);
    expect(stopNote("maxTurnRequests")).toMatch(/tool-call/i);
    expect(stopNote("refusal")).toMatch(/declined/i);
    expect(stopNote({ other: "network" })).toMatch(/network/);
  });
});
