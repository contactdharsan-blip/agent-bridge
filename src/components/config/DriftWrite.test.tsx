import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../state/toast";
import { DriftWrite } from "./DriftWrite";

// FR25's auto-regen bypasses the manual drift gate in two narrow, provably-
// safe cases. This is exactly the class of gate logic lessons.md warns about
// (state that gates an honest action must be invalidated correctly, and an
// effect can look right while a real timing race breaks it) — a behavioral
// render test, not just reasoning about the code, is what actually verifies
// it never fires when it shouldn't.
//
// The engines mocks below are STATEFUL (a fake disk + a "current correct
// projection" pointer) rather than fixed return values — a fixed `checkDrift`
// mock that always answers "missing" would never transition to "inSync"
// after a write, so this component's own re-check-after-write would see
// ANOTHER "missing" verdict and auto-write again forever. That's a test-mock
// artifact, not a real bug (a real re-read returns what was actually written)
// — modeling the disk for real is what avoids manufacturing a false failure.

const readNativeFile = vi.fn();
const writeNativeFile = vi.fn();
const checkDrift = vi.fn();

vi.mock("../../engines", () => ({
  checkDrift: (...args: unknown[]) => checkDrift(...args),
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

const server = (name: string) => ({
  name,
  transport: { transport: "stdio" as const, command: "x", args: [], env: [] },
  disabled: false,
});

// The fake disk + "what canonical currently wants" pointer the stateful
// mocks below read/write — reset per test.
let disk: string | null;
let want: string;

function renderDriftWrite(props: {
  servers: ReturnType<typeof server>[];
  contents: string | null;
  projecting: boolean;
}) {
  return render(
    <ToastProvider>
      <DriftWrite target="claude" cwd="/proj" {...props} />
    </ToastProvider>,
  );
}

describe("DriftWrite auto-regen (FR25)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemStorage());
    disk = null;
    want = "content-v1";
    readNativeFile.mockReset().mockImplementation(async () => disk);
    writeNativeFile.mockReset().mockImplementation(async (_cwd: string, _path: string, contents: string) => {
      disk = contents;
    });
    checkDrift
      .mockReset()
      .mockImplementation(async (_target: string, onDisk: string | null) => {
        if (onDisk === null) return { status: "missing" };
        if (onDisk === want) return { status: "inSync" };
        return { status: "drifted", added: [], removed: [], changed: ["a"] };
      });
  });
  afterEach(() => vi.clearAllMocks());

  it("never auto-writes on mount, even when the initial verdict is missing", async () => {
    renderDriftWrite({ servers: [server("a")], contents: "content-v1", projecting: false });

    await waitFor(() => expect(checkDrift).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(writeNativeFile).not.toHaveBeenCalled();
  });

  it("auto-writes after a real edit once the verdict is missing, and stops there", async () => {
    const { rerender } = renderDriftWrite({
      servers: [server("a")],
      contents: "content-v1",
      projecting: false,
    });
    await waitFor(() => expect(checkDrift).toHaveBeenCalledTimes(1));

    // A real canonical edit: servers/contents change together, already
    // settled (projecting false throughout — no debounce race here).
    want = "content-v2";
    rerender(
      <ToastProvider>
        <DriftWrite
          target="claude"
          cwd="/proj"
          servers={[server("a"), server("b")]}
          contents="content-v2"
          projecting={false}
        />
      </ToastProvider>,
    );

    await waitFor(() => expect(writeNativeFile).toHaveBeenCalledWith("/proj", ".mcp.json", "content-v2"));
    // The post-write re-check now resolves "inSync" against the real fake
    // disk — must settle there, not keep re-writing.
    await new Promise((r) => setTimeout(r, 20));
    expect(writeNativeFile).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-write while contents is still catching up to a newer servers edit (the debounce race)", async () => {
    const { rerender } = renderDriftWrite({
      servers: [server("a")],
      contents: "content-v1",
      projecting: false,
    });
    await waitFor(() => expect(checkDrift).toHaveBeenCalledTimes(1));

    // servers changed (arms auto-regen) but the projection hasn't caught up
    // yet (projecting: true) — contents is STILL the stale pre-edit value.
    rerender(
      <ToastProvider>
        <DriftWrite
          target="claude"
          cwd="/proj"
          servers={[server("a"), server("b")]}
          contents="content-v1"
          projecting={true}
        />
      </ToastProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(writeNativeFile).not.toHaveBeenCalled();

    // Now the projection catches up.
    want = "content-v2";
    rerender(
      <ToastProvider>
        <DriftWrite
          target="claude"
          cwd="/proj"
          servers={[server("a"), server("b")]}
          contents="content-v2"
          projecting={false}
        />
      </ToastProvider>,
    );
    await waitFor(() => expect(writeNativeFile).toHaveBeenCalledWith("/proj", ".mcp.json", "content-v2"));
  });

  it("auto-writes a drifted file only when the on-disk bytes match a previously-confirmed fingerprint", async () => {
    disk = "old-projection";
    want = "old-projection";

    const { rerender } = renderDriftWrite({
      servers: [server("a")],
      contents: "old-projection",
      projecting: false,
    });
    // in sync initially (disk matches `want`) — confirms the fingerprint.
    await waitFor(() => expect(checkDrift).toHaveBeenCalledTimes(1));
    expect(writeNativeFile).not.toHaveBeenCalled();

    // A real edit moves canonical forward; the disk still holds our own
    // prior (fingerprinted) write, so this should auto-regenerate.
    want = "new-projection";
    rerender(
      <ToastProvider>
        <DriftWrite
          target="claude"
          cwd="/proj"
          servers={[server("a"), server("b")]}
          contents="new-projection"
          projecting={false}
        />
      </ToastProvider>,
    );

    await waitFor(() =>
      expect(writeNativeFile).toHaveBeenCalledWith("/proj", ".mcp.json", "new-projection"),
    );
  });

  it("never auto-writes a drifted file whose on-disk bytes don't match any recorded fingerprint (a possible hand-edit)", async () => {
    disk = "someone-hand-edited-this";
    want = "content-v1";

    const { rerender } = renderDriftWrite({
      servers: [server("a")],
      contents: "content-v1",
      projecting: false,
    });
    await waitFor(() => expect(checkDrift).toHaveBeenCalledTimes(1));
    expect(writeNativeFile).not.toHaveBeenCalled();

    want = "content-v2";
    rerender(
      <ToastProvider>
        <DriftWrite
          target="claude"
          cwd="/proj"
          servers={[server("a"), server("b")]}
          contents="content-v2"
          projecting={false}
        />
      </ToastProvider>,
    );

    await waitFor(() => expect(checkDrift.mock.calls.length).toBeGreaterThanOrEqual(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(writeNativeFile).not.toHaveBeenCalled();
  });
});
