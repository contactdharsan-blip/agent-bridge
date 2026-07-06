import type { ReactNode } from "react";

// Per-agent marks, drawn in the same hand-authored inline-SVG style as Icon.tsx
// (CLAUDE.md: no icon library, no emoji — webviews render emoji differently).
// These are original geometric marks that *evoke* each agent, not copies of the
// vendors' trademarked logos. Keyed by the ACP registry id, exactly like
// displayName: display metadata per registry row, never a behavior branch —
// an unknown agent gets the generic chip mark and everything still works (M2
// win condition: zero `if agent == x` rendering logic).

const MARKS: Record<string, ReactNode> = {
  // Claude Code — a radiant burst.
  claude: (
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.9 5.9l2.8 2.8M15.3 15.3l2.8 2.8M18.1 5.9l-2.8 2.8M8.7 15.3l-2.8 2.8" />
  ),
  // Codex — a hexagonal cell with a core.
  codex: (
    <>
      <path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Cursor — an isometric cube.
  cursor: (
    <>
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9L12 3z" />
      <path d="M12 12l7.8-4.5M12 12v9M12 12L4.2 7.5" />
    </>
  ),
};

// Fallback for agents the mark map doesn't know yet — the same generic chip
// glyph the picker used for everyone before per-agent marks existed.
const FALLBACK: ReactNode = (
  <>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 9h6v6H9z" />
    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
  </>
);

export function AgentLogo({ id, className }: { id: string; className?: string }) {
  return (
    <svg
      className={className ? `icon agent-logo ${className}` : "icon agent-logo"}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {MARKS[id] ?? FALLBACK}
    </svg>
  );
}
