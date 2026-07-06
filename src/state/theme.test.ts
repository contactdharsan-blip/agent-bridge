import { describe, expect, it } from "vitest";
import {
  darkenHex,
  deriveAccent,
  hexToRgb,
  isAccentName,
  lightenHex,
  normalizeHex,
  rotateHue,
} from "./theme";

describe("normalizeHex", () => {
  it("accepts #rrggbb, #rgb (expanded), and a missing hash", () => {
    expect(normalizeHex("#34D399")).toBe("#34d399");
    expect(normalizeHex("#3d9")).toBe("#33dd99");
    expect(normalizeHex("34d399")).toBe("#34d399");
  });

  it("rejects malformed input", () => {
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("#34d39")).toBeNull();
    expect(normalizeHex("#gggggg")).toBeNull();
    expect(normalizeHex("rgb(1,2,3)")).toBeNull();
  });
});

describe("shade helpers", () => {
  it("darken moves every channel toward black, lighten toward white", () => {
    const [r0, g0, b0] = hexToRgb("#34d399")!;
    const [rd, gd, bd] = hexToRgb(darkenHex("#34d399", 0.35))!;
    const [rl, gl, bl] = hexToRgb(lightenHex("#34d399", 0.4))!;
    expect(rd).toBeLessThanOrEqual(r0);
    expect(gd).toBeLessThan(g0);
    expect(bd).toBeLessThan(b0);
    expect(rl).toBeGreaterThan(r0);
    expect(gl).toBeGreaterThan(g0);
    expect(bl).toBeGreaterThan(b0);
  });

  it("full darken is black, full lighten is white", () => {
    expect(darkenHex("#34d399", 1)).toBe("#000000");
    expect(lightenHex("#34d399", 1)).toBe("#ffffff");
  });
});

describe("rotateHue", () => {
  it("rotating 360° round-trips (within 8-bit rounding)", () => {
    const [r, g, b] = hexToRgb(rotateHue("#34d399", 360))!;
    const [r0, g0, b0] = hexToRgb("#34d399")!;
    expect(Math.abs(r - r0)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - g0)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - b0)).toBeLessThanOrEqual(2);
  });

  it("rotating red 120° gives green", () => {
    expect(rotateHue("#ff0000", 120)).toBe("#00ff00");
  });

  it("leaves greys alone — no hue to rotate", () => {
    expect(rotateHue("#808080", 90)).toBe("#808080");
  });
});

describe("deriveAccent", () => {
  it("derives a full coherent set from one hex", () => {
    const a = deriveAccent("#34d399")!;
    expect(a.primary).toBe("#34d399");
    expect(a.primaryRgb).toBe("52, 211, 153");
    expect(a.primaryDark).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.primaryLight).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.secondary).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.secondary).not.toBe(a.primary);
    expect(a.secondaryRgb.split(",")).toHaveLength(3);
  });

  it("returns null on malformed hex instead of a broken theme", () => {
    expect(deriveAccent("not-a-color")).toBeNull();
  });
});

describe("isAccentName", () => {
  it("distinguishes presets from hex values", () => {
    expect(isAccentName("emerald")).toBe(true);
    expect(isAccentName("#34d399")).toBe(false);
  });
});
