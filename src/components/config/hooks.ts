// Debounced async wrappers over the projection commands, so the "form + live
// preview" surface re-projects as the canonical entities change without spamming
// IPC on every keystroke. Each returns an explicit loading/data/error triple so
// the panel can render all four UI states (UI-NFR5).

import { useEffect, useRef, useState } from "react";
import { previewInstructions, previewMcp } from "../../engines";
import type { Instructions, InstructionArtifact, McpProjection, McpServer, Target } from "../../engineTypes";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 250;

export function useMcpPreview(target: Target, servers: McpServer[]): AsyncState<McpProjection> {
  const key = JSON.stringify(servers);
  return useDebouncedAsync<McpProjection>(() => previewMcp(target, servers), [target, key], target);
}

export function useInstructionsPreview(
  target: Target,
  instructions: Instructions,
): AsyncState<InstructionArtifact> {
  const key = instructions.markdown;
  return useDebouncedAsync<InstructionArtifact>(
    () => previewInstructions(target, instructions),
    [target, key],
    target,
  );
}

/**
 * Run `run` after a debounce whenever `deps` change; latest call wins.
 * `resetKey`: when THIS changes (e.g. the projection target), stale data is
 * dropped immediately — the header updates instantly, so keeping the previous
 * target's content under it for debounce+IPC time silently mislabels it.
 * Same-key re-runs (typing) keep the old content visible instead of flashing
 * a skeleton per keystroke.
 */
function useDebouncedAsync<T>(run: () => Promise<T>, deps: unknown[], resetKey?: unknown): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const runRef = useRef(run);
  runRef.current = run;
  const prevReset = useRef(resetKey);

  useEffect(() => {
    let cancelled = false;
    if (prevReset.current !== resetKey) {
      prevReset.current = resetKey;
      setState({ data: null, loading: true, error: null });
    } else {
      setState((s) => ({ ...s, loading: true, error: null }));
    }
    const timer = setTimeout(() => {
      runRef
        .current()
        .then((data) => {
          if (!cancelled) setState({ data, loading: false, error: null });
        })
        .catch((e) => {
          if (!cancelled) setState({ data: null, loading: false, error: String(e) });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
