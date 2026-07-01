import { describe, expect, it } from "vitest";
import { toCanonicalValue } from "./canonical";

describe("toCanonicalValue", () => {
  it("omits empty instructions and AGENTS.md so they don't project as blank files", () => {
    const c = toCanonicalValue([], { markdown: "" }, "");
    expect(c.instructions).toBeUndefined();
    expect(c.agentsMd).toBeUndefined();
    expect(c.mcpServers).toEqual([]);
    expect(c.skills).toEqual([]);
  });

  it("includes instructions and AGENTS.md when present", () => {
    const c = toCanonicalValue([], { markdown: "# hi" }, "agents");
    expect(c.instructions).toEqual({ markdown: "# hi" });
    expect(c.agentsMd).toBe("agents");
  });
});
