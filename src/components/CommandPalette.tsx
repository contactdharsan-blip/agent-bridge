import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

// Keyboard-first command palette (UI-FR29). Reaches every primary action; fully
// operable from the keyboard (type to filter, arrows to move, Enter to run, Escape
// to dismiss). The mouse paths still exist — this is the accelerator (UI-NFR4).
export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Case-insensitive subsequence match, so "gcfg" finds "Go to Config". */
export function matches(label: string, query: string): boolean {
  if (!query) return true;
  const l = label.toLowerCase();
  let i = 0;
  for (const ch of query.toLowerCase()) {
    i = l.indexOf(ch, i);
    if (i === -1) return false;
    i += 1;
  }
  return true;
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const filtered = useMemo(
    () => commands.filter((c) => matches(c.label, query)),
    [commands, query],
  );

  useEffect(() => {
    if (!open) return;
    // Remember what had focus so we can restore it on close (WCAG 2.4.3).
    prevFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setSelected(0);
    // Focus after the overlay mounts.
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => prevFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      // The input is the only focusable child — keep focus trapped in the modal.
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(selected);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="palette-overlay" onClick={onClose} role="presentation">
      <div
        className="palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="palette-input-row">
          <Icon name="chevronRight" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Type a command…"
            aria-label="Command palette"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={filtered[selected] ? `palette-opt-${filtered[selected].id}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul id="palette-listbox" className="palette-list" role="listbox">
          {filtered.length === 0 && <li className="palette-empty">No matching commands</li>}
          {filtered.map((c, i) => (
            <li
              key={c.id}
              id={`palette-opt-${c.id}`}
              role="option"
              aria-selected={i === selected}
              className={`palette-item ${i === selected ? "palette-item-active" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => runAt(i)}
            >
              <span>{c.label}</span>
              {c.hint && <kbd className="kbd">{c.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
