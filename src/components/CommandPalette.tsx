import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

// Keyboard-first command palette (UI-FR29). Reaches every primary action; fully
// operable from the keyboard (type to filter, arrows to move, Enter to run, Escape
// to dismiss). The mouse paths still exist — this is the accelerator (UI-NFR4).
// Built on Radix Dialog: real focus-trap cycling + auto focus-restore on close
// (WCAG 2.4.3), rather than the hand-rolled Tab-blocking this replaces.
export interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
  /** When set, the command is listed but inert, with the reason shown — an
   * absent command is undiscoverable; a disabled one teaches (UI-NFR4). */
  disabledReason?: string;
}

/**
 * Ranked fuzzy score (0 = no match): case-insensitive subsequence, rewarding
 * contiguous runs and word-boundary hits, lightly penalizing gaps. A ~40-line
 * scorer closes the relevance gap to cmdk without the dep (see todo.md's
 * library-research table).
 */
export function commandScore(label: string, query: string): number {
  if (!query) return 1;
  const l = label.toLowerCase();
  let li = 0;
  let score = 0;
  let streak = 0;
  for (const ch of query.toLowerCase()) {
    const found = l.indexOf(ch, li);
    if (found === -1) return 0;
    streak = found === li && li !== 0 ? streak + 1 : 1;
    score += streak * 2;
    if (found === 0 || l[found - 1] === " ") score += 3;
    score -= Math.min(found - li, 8) * 0.2;
    li = found + 1;
  }
  return Math.max(score, 0.001) / (l.length * 0.02 + 1);
}

/** Case-insensitive subsequence match, so "gcfg" finds "Go to Config". */
export function matches(label: string, query: string): boolean {
  return commandScore(label, query) > 0;
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

  const filtered = useMemo(() => {
    if (!query) return commands;
    return commands
      .map((c, i) => ({ c, i, s: commandScore(c.label, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.c);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
  }, [open]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd || cmd.disabledReason) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(selected);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="palette-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              className="palette"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -8 }}
                transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Type to filter commands, arrow keys to move, Enter to run.
                </Dialog.Description>
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
                      aria-disabled={c.disabledReason ? true : undefined}
                      className={`palette-item ${i === selected ? "palette-item-active" : ""} ${c.disabledReason ? "palette-item-disabled" : ""}`}
                      onMouseEnter={() => setSelected(i)}
                      onClick={() => runAt(i)}
                    >
                      <span>{c.label}</span>
                      {c.disabledReason ? (
                        <span className="palette-reason">{c.disabledReason}</span>
                      ) : (
                        c.hint && <kbd className="kbd">{c.hint}</kbd>
                      )}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
