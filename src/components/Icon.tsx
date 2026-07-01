// Inline-SVG icon set (lucide-style strokes). The design system bans emoji in UI
// (rendering differs across the three Tauri webviews) and asks for icons mapped by
// a typed lookup — so every status/action signal here is icon + text, never color
// or an emoji alone (UI-NFR6, DESIGN §9).

import type { ReactNode } from "react";

export type IconName =
  | "check"
  | "x"
  | "alert"
  | "arrowRight"
  | "switch"
  | "refresh"
  | "plus"
  | "minus"
  | "key"
  | "config"
  | "user"
  | "cpu"
  | "send"
  | "stop"
  | "sparkles"
  | "shield"
  | "dot"
  | "trash"
  | "chevronRight"
  | "handoff"
  | "info";

// Each entry is the inner geometry of a 24×24 stroke icon (except `dot`, a fill).
const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  alert: (
    <>
      <path d="m10.29 3.86-8.18 14.15A2 2 0 0 0 3.85 21h16.3a2 2 0 0 0 1.74-2.99L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  arrowRight: <path d="M5 12h14M12 5l7 7-7 7" />,
  switch: (
    <>
      <path d="M8 3 4 7l4 4M4 7h16" />
      <path d="M16 21l4-4-4-4M20 17H4" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  key: (
    <>
      <path d="M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 0 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4z" />
      <path d="M15.5 7.5h.01" />
    </>
  ),
  config: (
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 9h6v6H9z" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </>
  ),
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  sparkles: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 3v3M20.5 4.5h-3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  trash: (
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
  ),
  chevronRight: <path d="m9 18 6-6-6-6" />,
  handoff: (
    <>
      <path d="M4 12h13" />
      <path d="m13 6 6 6-6 6" />
      <path d="M4 4v4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
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
      {PATHS[name]}
    </svg>
  );
}
