// Accent theming (UI-FR34). The Dark Liquid-Glass system is single-accent and
// themeable through --theme-* variables; swapping them re-skins the whole app.
// Cosmetic only — every status/honesty signal still carries icon + text, so no
// meaning ever rests on the accent hue (UI-NFR6).

export type AccentName = "emerald" | "sky" | "violet";

interface Accent {
  primary: string;
  primaryRgb: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  secondaryRgb: string;
}

export const ACCENTS: Record<AccentName, Accent> = {
  emerald: {
    primary: "#34d399",
    primaryRgb: "52, 211, 153",
    primaryDark: "#059669",
    primaryLight: "#6ee7b7",
    secondary: "#38bdf8",
    secondaryRgb: "56, 189, 248",
  },
  sky: {
    primary: "#38bdf8",
    primaryRgb: "56, 189, 248",
    primaryDark: "#0284c7",
    primaryLight: "#7dd3fc",
    secondary: "#22d3ee",
    secondaryRgb: "34, 211, 238",
  },
  violet: {
    primary: "#a78bfa",
    primaryRgb: "167, 139, 250",
    primaryDark: "#7c3aed",
    primaryLight: "#c4b5fd",
    secondary: "#f472b6",
    secondaryRgb: "244, 114, 182",
  },
};

export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[];

export function applyAccent(name: AccentName): void {
  const a = ACCENTS[name] ?? ACCENTS.emerald;
  const r = document.documentElement.style;
  r.setProperty("--theme-primary", a.primary);
  r.setProperty("--theme-primary-rgb", a.primaryRgb);
  r.setProperty("--theme-primary-dark", a.primaryDark);
  r.setProperty("--theme-primary-light", a.primaryLight);
  r.setProperty("--theme-secondary", a.secondary);
  r.setProperty("--theme-secondary-rgb", a.secondaryRgb);
}
