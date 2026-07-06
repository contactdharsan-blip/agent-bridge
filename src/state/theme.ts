// Accent theming (UI-FR34). The Dark Liquid-Glass system is single-accent and
// themeable through --theme-* variables; swapping them re-skins the whole app.
// Cosmetic only — every status/honesty signal still carries icon + text, so no
// meaning ever rests on the accent hue (UI-NFR6).
//
// Two sources: the three curated presets, or any hex the user picks with the
// color input. A custom pick derives the full 6-variable set (dark/light
// shades, rgb triplets, a hue-shifted secondary) with the pure helpers below,
// so a single hex re-skins the app as coherently as a preset does.

export type AccentName = "emerald" | "sky" | "violet";

/** A stored accent: a preset name, or a "#rrggbb" hex from the color picker. */
export type AccentValue = string;

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

export function isAccentName(value: string): value is AccentName {
  return value in ACCENTS;
}

// ---- pure color math for custom accents -------------------------------------

/** Expand/validate a CSS hex color to "#rrggbb" lowercase; null if malformed. */
export function normalizeHex(hex: string): string | null {
  const m = hex.trim().toLowerCase().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  const h = m[1];
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `#${full}`;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return [
    parseInt(n.slice(1, 3), 16),
    parseInt(n.slice(3, 5), 16),
    parseInt(n.slice(5, 7), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Per-channel blend of `hex` toward `target` by t ∈ [0,1]. */
function mixHex(hex: string, target: [number, number, number], t: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex([
    rgb[0] + (target[0] - rgb[0]) * t,
    rgb[1] + (target[1] - rgb[1]) * t,
    rgb[2] + (target[2] - rgb[2]) * t,
  ]);
}

export const darkenHex = (hex: string, t: number): string => mixHex(hex, [0, 0, 0], t);
export const lightenHex = (hex: string, t: number): string => mixHex(hex, [255, 255, 255], t);

/** Rotate the hue, preserving saturation/lightness — how a single pick gets a
 * coherent companion secondary (the presets pair hues ~40° apart). */
export function rotateHue(hex: string, degrees: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  h = (((h + degrees) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return rgbToHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

function rgbTriplet(hex: string): string {
  const rgb = hexToRgb(hex);
  return rgb ? `${rgb[0]}, ${rgb[1]}, ${rgb[2]}` : "0, 0, 0";
}

/** Derive the full accent set from one hex. Ratios chosen to sit in the same
 * range as the hand-tuned presets (e.g. emerald→sky is a ~+40° hue pair). */
export function deriveAccent(hex: string): Accent | null {
  const primary = normalizeHex(hex);
  if (!primary) return null;
  const secondary = rotateHue(primary, 40);
  return {
    primary,
    primaryRgb: rgbTriplet(primary),
    primaryDark: darkenHex(primary, 0.35),
    primaryLight: lightenHex(primary, 0.4),
    secondary,
    secondaryRgb: rgbTriplet(secondary),
  };
}

// ---- application -------------------------------------------------------------

function setThemeVars(a: Accent): void {
  const r = document.documentElement.style;
  r.setProperty("--theme-primary", a.primary);
  r.setProperty("--theme-primary-rgb", a.primaryRgb);
  r.setProperty("--theme-primary-dark", a.primaryDark);
  r.setProperty("--theme-primary-light", a.primaryLight);
  r.setProperty("--theme-secondary", a.secondary);
  r.setProperty("--theme-secondary-rgb", a.secondaryRgb);
}

export function applyAccent(name: AccentName): void {
  setThemeVars(ACCENTS[name] ?? ACCENTS.emerald);
}

/** Apply a stored accent value — preset name or custom hex. Unknown/malformed
 * values (e.g. hand-edited storage) fall back to the emerald preset. */
export function applyAccentValue(value: AccentValue): void {
  if (isAccentName(value)) {
    setThemeVars(ACCENTS[value]);
    return;
  }
  setThemeVars(deriveAccent(value) ?? ACCENTS.emerald);
}
