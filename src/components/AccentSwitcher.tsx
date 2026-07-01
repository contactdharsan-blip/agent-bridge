import { ACCENT_NAMES, ACCENTS, type AccentName } from "../state/theme";

// Three accent dots in the header. Cosmetic re-skin only (UI-FR34).
export function AccentSwitcher({
  accent,
  onChange,
}: {
  accent: AccentName;
  onChange: (a: AccentName) => void;
}) {
  return (
    <div className="accent-switcher" role="radiogroup" aria-label="Accent color">
      {ACCENT_NAMES.map((name) => (
        <button
          key={name}
          role="radio"
          aria-checked={accent === name}
          aria-label={name}
          title={name}
          className={`accent-dot ${accent === name ? "accent-dot-active" : ""}`}
          style={{ background: ACCENTS[name].primary }}
          onClick={() => onChange(name)}
        />
      ))}
    </div>
  );
}
