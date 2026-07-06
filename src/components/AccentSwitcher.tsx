import { type KeyboardEvent, useRef } from "react";
import { ACCENT_NAMES, ACCENTS, type AccentValue, isAccentName, normalizeHex } from "../state/theme";

// Preset accent dots + a free color picker in the header. Cosmetic re-skin only
// (UI-FR34). The three dots declare the WAI-ARIA radiogroup pattern, so they
// behave like one: a single tab stop (roving tabindex) plus Arrow/Home/End to
// move+select, focus following selection. The custom pick is a native
// <input type="color"> — its own tab stop with the platform's picker UI, which
// beats any hand-rolled palette for both a11y and familiarity.

const CUSTOM_FALLBACK = "#8b5cf6";

export function AccentSwitcher({
  accent,
  onChange,
}: {
  accent: AccentValue;
  onChange: (a: AccentValue) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const customActive = !isAccentName(accent);

  const select = (index: number) => {
    const clamped = (index + ACCENT_NAMES.length) % ACCENT_NAMES.length;
    onChange(ACCENT_NAMES[clamped]);
    refs.current[clamped]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = isAccentName(accent) ? ACCENT_NAMES.indexOf(accent) : -1;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        select(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        select(i - 1);
        break;
      case "Home":
        e.preventDefault();
        select(0);
        break;
      case "End":
        e.preventDefault();
        select(ACCENT_NAMES.length - 1);
        break;
    }
  };

  return (
    <div className="accent-switcher">
      <div role="radiogroup" aria-label="Accent color" onKeyDown={onKeyDown} className="accent-presets">
        {ACCENT_NAMES.map((name, i) => (
          <button
            key={name}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="radio"
            aria-checked={accent === name}
            aria-label={name}
            title={name}
            // When a custom color is active no preset is checked; the first dot
            // stays the group's tab stop so keyboard users can still enter it.
            tabIndex={accent === name || (customActive && i === 0) ? 0 : -1}
            className={`accent-dot ${accent === name ? "accent-dot-active" : ""}`}
            style={{ background: ACCENTS[name].primary }}
            onClick={() => onChange(name)}
          />
        ))}
      </div>
      <input
        type="color"
        className={`accent-custom ${customActive ? "accent-dot-active" : ""}`}
        aria-label="Custom accent color"
        title="Pick a custom accent color"
        value={customActive ? (normalizeHex(accent) ?? CUSTOM_FALLBACK) : CUSTOM_FALLBACK}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
