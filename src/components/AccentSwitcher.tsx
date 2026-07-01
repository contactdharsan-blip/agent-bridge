import { type KeyboardEvent, useRef } from "react";
import { ACCENT_NAMES, ACCENTS, type AccentName } from "../state/theme";

// Three accent dots in the header. Cosmetic re-skin only (UI-FR34). Declares the
// WAI-ARIA radiogroup pattern, so it must behave like one: a single tab stop
// (roving tabindex) plus Arrow/Home/End to move+select, focus following selection.
export function AccentSwitcher({
  accent,
  onChange,
}: {
  accent: AccentName;
  onChange: (a: AccentName) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const clamped = (index + ACCENT_NAMES.length) % ACCENT_NAMES.length;
    onChange(ACCENT_NAMES[clamped]);
    refs.current[clamped]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ACCENT_NAMES.indexOf(accent);
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
    <div
      className="accent-switcher"
      role="radiogroup"
      aria-label="Accent color"
      onKeyDown={onKeyDown}
    >
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
          tabIndex={accent === name ? 0 : -1}
          className={`accent-dot ${accent === name ? "accent-dot-active" : ""}`}
          style={{ background: ACCENTS[name].primary }}
          onClick={() => onChange(name)}
        />
      ))}
    </div>
  );
}
