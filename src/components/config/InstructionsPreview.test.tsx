import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../state/toast";
import { InstructionsPreview } from "./InstructionsPreview";
import type { AsyncState } from "./hooks";
import type { InstructionArtifact } from "../../engineTypes";

// FR25's auto-regen for instructions (the InstructionsPreview counterpart to
// DriftWrite's) — same safety properties, verified behaviorally rather than
// by reasoning alone: never on mount, auto-write when safe after a real
// edit, never past a possible hand-edit with no matching fingerprint. The
// `state` prop here already IS the settled projection (no separate debounced
// side-channel like DriftWrite's `contents` vs `servers`), so there's no
// analogous "still catching up" race to model.

const readNativeFile = vi.fn();
const writeNativeFile = vi.fn();

vi.mock("../../engines", () => ({
  readNativeFile: (...args: unknown[]) => readNativeFile(...args),
  writeNativeFile: (...args: unknown[]) => writeNativeFile(...args),
}));

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

let disk: string | null;

function artifact(contents: string): InstructionArtifact {
  return {
    target: "claude",
    path: "CLAUDE.md",
    contents,
    equivalentNotIdentical: true,
    fidelityNote: "test",
  };
}

function state(contents: string): AsyncState<InstructionArtifact> {
  return { data: artifact(contents), loading: false, error: null };
}

function renderPreview(contents: string) {
  return render(
    <ToastProvider>
      <InstructionsPreview state={state(contents)} cwd="/proj" />
    </ToastProvider>,
  );
}

describe("InstructionsPreview auto-regen (FR25)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemStorage());
    // jsdom doesn't implement scrollIntoView — the hand-edit test opens the
    // pre-existing overwrite gate, whose scroll-into-view effect is
    // unrelated to what's under test here.
    Element.prototype.scrollIntoView = vi.fn();
    disk = null;
    readNativeFile.mockReset().mockImplementation(async () => disk);
    writeNativeFile.mockReset().mockImplementation(async (_cwd: string, _path: string, contents: string) => {
      disk = contents;
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("never reads or auto-writes on mount — nothing has been edited yet", async () => {
    renderPreview("instructions-v1");
    await new Promise((r) => setTimeout(r, 20));
    expect(readNativeFile).not.toHaveBeenCalled();
    expect(writeNativeFile).not.toHaveBeenCalled();
  });

  it("auto-writes after a real edit once the file is absent, and settles", async () => {
    const { rerender } = renderPreview("instructions-v1");
    await new Promise((r) => setTimeout(r, 10));

    // A real canonical edit: the projection artifact changes.
    rerender(
      <ToastProvider>
        <InstructionsPreview state={state("instructions-v2")} cwd="/proj" />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(writeNativeFile).toHaveBeenCalledWith("/proj", "CLAUDE.md", "instructions-v2"),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(writeNativeFile).toHaveBeenCalledTimes(1);
  });

  it("auto-writes a differing file only when the on-disk bytes match a previously-confirmed fingerprint", async () => {
    // Simulate a fingerprint confirmed in an earlier session (e.g. a prior
    // explicit write), without needing a live edit to produce it here.
    localStorage.setItem(
      "agentbridge.nativeFileFingerprint./proj.CLAUDE.md",
      JSON.stringify("old-instructions"),
    );
    disk = "old-instructions";

    const { rerender } = renderPreview("instructions-v1");
    await new Promise((r) => setTimeout(r, 10));
    expect(writeNativeFile).not.toHaveBeenCalled();

    // A real edit moves canonical forward; the disk still holds the
    // fingerprinted content, so this should auto-regenerate past it.
    rerender(
      <ToastProvider>
        <InstructionsPreview state={state("new-instructions")} cwd="/proj" />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(writeNativeFile).toHaveBeenCalledWith("/proj", "CLAUDE.md", "new-instructions"),
    );
  });

  it("never auto-writes past a differing file with no matching fingerprint (a possible hand-edit)", async () => {
    disk = "someone-hand-edited-this";

    const { rerender } = renderPreview("instructions-v1");
    await new Promise((r) => setTimeout(r, 10));
    expect(writeNativeFile).not.toHaveBeenCalled();

    rerender(
      <ToastProvider>
        <InstructionsPreview state={state("instructions-v2")} cwd="/proj" />
      </ToastProvider>,
    );

    await waitFor(() => expect(readNativeFile).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(writeNativeFile).not.toHaveBeenCalled();
  });
});
