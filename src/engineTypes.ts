// TypeScript mirror of the pure-engine serde types (crates/canonical, projection,
// handoff, profile, secrets). Shapes match the Rust `#[serde]` attributes exactly,
// so the IPC contract is the same one the Rust tests assert.

// ---- canonical ------------------------------------------------------------
export type Target = "claude" | "codex" | "cursor";
export type Agent = "claude" | "codex" | "cursor";

export type SecretRef =
  | { kind: "env"; var: string }
  | { kind: "keychain"; service: string; account: string };

export type ConfigValue =
  | { type: "literal"; value: string }
  | { type: "secret"; secret: SecretRef };

export interface EnvVar { key: string; value: ConfigValue }
export interface Header { name: string; value: ConfigValue }

export type McpTransport =
  | { transport: "stdio"; command: string; args: string[]; env: EnvVar[] }
  | { transport: "http"; url: string; headers: Header[] };

export interface McpServer {
  name: string;
  transport: McpTransport;
  toolCount?: number;
  disabled: boolean;
}

export interface Instructions { markdown: string }
export interface Skill { name: string; sourceDir: string }

export interface Canonical {
  mcpServers: McpServer[];
  skills: Skill[];
  instructions?: Instructions;
  agentsMd?: string;
}

// ---- projection -----------------------------------------------------------
export type ProjectionWarning =
  | { code: "cursorToolCeiling"; total: number; ceiling: number }
  | { code: "unknownToolCounts"; servers: string[] };

export interface McpProjection {
  contents: string;
  toolCount: number;
  warnings: ProjectionWarning[];
}

export interface InstructionArtifact {
  target: Target;
  path: string;
  contents: string;
  equivalentNotIdentical: boolean;
  fidelityNote: string;
}

export type DriftStatus =
  | { status: "missing" }
  | { status: "inSync" }
  | { status: "drifted"; added: string[]; removed: string[]; changed: string[] }
  | { status: "unreadable"; detail: string };

// ---- handoff --------------------------------------------------------------
export type TaskStatus = "pending" | "inProgress" | "completed";

export interface ContextSnapshot {
  sourceAgent: string;
  targetAgent: string;
  timestamp: string;
  workingDirectory: string;
  openFiles: string[];
  taskList: { text: string; status: TaskStatus }[];
  recentEdits: { file: string; hunkSummary: string }[];
  decisions: string[];
  conversationSummary: string;
  activeMcp: string[];
  activeSkills: string[];
}

// ---- profile --------------------------------------------------------------
// Kept structural; the Rust validator is the source of truth (validate_profile).
export interface CoderProfile {
  schemaVersion: number;
  agent: Agent;
  data: { sessionsAnalyzed: number; daysCovered: number; messagesAnalyzed: number };
  taskMix: { category: string; fraction: number }[];
  frictionPoints: unknown[];
  repeatedInstructions: { text: string; occurrences: number; candidateRule: string }[];
  toolUsage: Record<string, number>;
  efficiency: Record<string, number>;
  strengths: string[];
  agentAffinity: unknown[];
  signatures: Record<string, unknown>;
}

export interface AgentWeight { agent: Agent; weight: number; confidence: number }

export interface MergedProfile {
  agents: AgentWeight[];
  taskMix: { category: string; fraction: number }[];
  frictionPoints: unknown[];
  repeatedInstructions: { text: string; occurrences: number; candidateRule: string }[];
  toolUsageByAgent: unknown[];
  strengths: string[];
  agentAffinity: unknown[];
  signatures: Record<string, unknown>;
}

export interface Recommendation {
  feature: { agent: Agent; slug: string; name: string; description: string };
  because: string;
  evidence: string;
}

export type Equivalence = "equivalent" | "approximation";

export type Resolution =
  | { kind: "marketplace"; name: string; source: string }
  | { kind: "generatedSkill"; name: string; skillMd: string }
  | { kind: "rule"; canonicalRule: string };

export interface GapFill {
  capability: string;
  target: Agent;
  equivalence: Equivalence;
  motivation: string;
  resolution: Resolution;
  profileSpecific: boolean;
}

export interface ContinuityReport {
  target: Agent;
  transfersAutomatically: string[];
  needsSubstitute: GapFill[];
  addForParity: GapFill[];
  genuinelyLost: string[];
}

// ---- secrets --------------------------------------------------------------
export interface SecretBinding {
  envName: string;
  resolvable: boolean;
  fromKeychain: boolean;
}
