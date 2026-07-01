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

describe("App", () => {
  it("mounts the shell and renders the tabs without crashing", () => {
    render(
      <ToastProvider>
        <CanonicalProvider>
          <App />
        </CanonicalProvider>
      </ToastProvider>,
    );
    expect(screen.getByText("Agent Bridge")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Run/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Config/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Handoff/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Profile/ })).toBeTruthy();
  });
});
