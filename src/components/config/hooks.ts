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
  return useDebouncedAsync<McpProjection>(() => previewMcp(target, servers), [target, key]);
}

export function useInstructionsPreview(
  target: Target,
  instructions: Instructions,
): AsyncState<InstructionArtifact> {
  const key = instructions.markdown;
  return useDebouncedAsync<InstructionArtifact>(
    () => previewInstructions(target, instructions),
    [target, key],
  );
}

/** Run `run` after a debounce whenever `deps` change; latest call wins. */
function useDebouncedAsync<T>(run: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
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
