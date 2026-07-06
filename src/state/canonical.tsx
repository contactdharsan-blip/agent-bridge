// The canonical store — the single source of truth the whole app edits (FR6).
// Native config files are generate-only artifacts; nothing here mirrors them back.
// Lifted into context so the Config panel edits it while the Profile/Continuity
// panel reads the same `Canonical` that `workflow_continuity` consumes.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Canonical, Instructions, McpServer } from "../engineTypes";
import { load, save } from "./persist";

interface PersistedCanonical {
  servers: McpServer[];
  instructions: Instructions;
  agentsMd: string;
}
const STORE_KEY = "canonical";

export interface CanonicalStore {
  servers: McpServer[];
  instructions: Instructions;
  agentsMd: string;
  setServers: (next: McpServer[]) => void;
  updateServer: (index: number, next: McpServer) => void;
  addServer: () => void;
  removeServer: (index: number) => void;
  setInstructions: (markdown: string) => void;
  setAgentsMd: (text: string) => void;
  /** Assemble the `Canonical` value the engine commands take. */
  toCanonical: () => Canonical;
}

const Ctx = createContext<CanonicalStore | null>(null);

/** Assemble the `Canonical` value the engine commands take (pure — unit-tested). */
export function toCanonicalValue(
  servers: McpServer[],
  instructions: Instructions,
  agentsMd: string,
): Canonical {
  return {
    mcpServers: servers,
    skills: [],
    instructions: instructions.markdown ? instructions : undefined,
    agentsMd: agentsMd || undefined,
  };
}

/** A fresh stdio MCP server row (the common case; http servers are edited as
 * pasted URLs in a later iteration — the projectors already handle both). */
function blankServer(): McpServer {
  return {
    name: "new-server",
    transport: { transport: "stdio", command: "npx", args: [], env: [] },
    disabled: false,
  };
}

export function CanonicalProvider({ children }: { children: ReactNode }) {
  const initial = load<PersistedCanonical>(STORE_KEY, {
    servers: [],
    instructions: { markdown: "" },
    agentsMd: "",
  });
  const [servers, setServers] = useState<McpServer[]>(initial.servers);
  const [instructions, setInstr] = useState<Instructions>(initial.instructions);
  const [agentsMd, setAgentsMd] = useState<string>(initial.agentsMd);

  // Persist locally on every change so edits survive a reload (UI-FR30).
  useEffect(() => {
    save<PersistedCanonical>(STORE_KEY, { servers, instructions, agentsMd });
  }, [servers, instructions, agentsMd]);

  const store = useMemo<CanonicalStore>(
    () => ({
      servers,
      instructions,
      agentsMd,
      setServers,
      updateServer: (index, next) =>
        setServers((prev) => prev.map((s, i) => (i === index ? next : s))),
      addServer: () => setServers((prev) => [...prev, blankServer()]),
      removeServer: (index) => setServers((prev) => prev.filter((_, i) => i !== index)),
      setInstructions: (markdown) => setInstr({ markdown }),
      setAgentsMd,
      toCanonical: () => toCanonicalValue(servers, instructions, agentsMd),
    }),
    [servers, instructions, agentsMd],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useCanonical(): CanonicalStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useCanonical must be used within a CanonicalProvider");
  return store;
}
