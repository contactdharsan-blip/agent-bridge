import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { CanonicalProvider } from "./state/canonical";
import { ToastProvider } from "./state/toast";

// App-level render smoke: mount the whole shell (providers + all four tabs wired)
// in jsdom with the Tauri IPC stubbed out, and assert it comes up without throwing.
// This is the headless stand-in for launching the Tauri window (which needs a
// display) — it exercises the real component tree, effects, and providers.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.reject(new Error("no tauri in test")),
  Channel: class {
    onmessage: unknown = null;
  },
}));

// A minimal Map-backed Storage, same pattern as state/persist.test.ts — jsdom's
// origin-gated localStorage isn't reliable here, so persist.ts's own tests stub it.
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

describe("App", () => {
  it("mounts the shell and renders the tabs without crashing", () => {
    // This test is about shell structure, not the first-launch tour — seed
    // "already toured" so the modal tour (which correctly aria-hides the rest
    // of the shell while open) doesn't shadow the tab roles below.
    const storage = new MemStorage();
    storage.setItem("agentbridge.settings.tourCompleted", "true");
    vi.stubGlobal("localStorage", storage);
    render(
      <ToastProvider>
        <CanonicalProvider>
          <App />
        </CanonicalProvider>
      </ToastProvider>,
    );
    expect(screen.getByText("Agent Bridge")).toBeTruthy();
    // Exact names — the onboarding card also has "Open Config"/"Open Profile".
    // role="tab" (not "button") since the tab bar is a real Radix Tabs.Trigger now —
    // proper APG tablist semantics, not a hand-rolled button group.
    expect(screen.getByRole("tab", { name: "Run" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Config" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Handoff" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Profile" })).toBeTruthy();
  });
});
