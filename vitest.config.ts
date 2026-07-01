import { defineConfig } from "vitest/config";

// Hermetic frontend unit suite (UI-PRD §12): pure client-side glue only — no key,
// no network, no display. jsdom gives the persistence round-trip a real
// localStorage. Test files import { describe, it, expect } from "vitest" directly.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
