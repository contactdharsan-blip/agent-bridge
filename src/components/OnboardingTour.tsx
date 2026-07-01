import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { TOUR_STEPS } from "../data/tourSteps";
import { Icon } from "./Icon";

// Must exceed App.tsx's tab-switch transition (0.16s, App.tsx:209) so the
// target element has actually mounted before we highlight it.
const TAB_SWITCH_SETTLE_MS = 220;

// The first-launch guided walkthrough (UI-FR28, previously deferred). Unlike
// CommandPalette, dismissal is Skip/Finish/Escape only — a multi-step teaching
// flow shouldn't discard progress on a stray backdrop click. It drives the
// real tab underneath itself (via onTabChange) and spotlights the real DOM
// element for each step (via data-tour-step) — never a mock screenshot.
//
// The highlight is a `tour-highlight` class toggled onto the real target
// element for the active step, so its ring tracks the element exactly through
// tab switches, scroll, and layout animation — no separately-measured fixed
// box that can drift. The overlay is transparent (no dim/blur), so the rest of
// the app stays fully visible and only the target reads as highlighted; with
// nothing dark to punch through, the target no longer needs its own stacking
// context lifted above an overlay the way a dimming spotlight would require.
export function OnboardingTour({
  open,
  onClose,
  tab,
  onTabChange,
}: {
  open: boolean;
  onClose: () => void;
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const step = TOUR_STEPS[stepIndex];
  const last = stepIndex === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (!open || !step) return;
    const needsSwitch = step.tab !== tab;
    if (needsSwitch) onTabChange(step.tab);
    if (!step.selector) return;

    let highlighted: HTMLElement | null = null;
    const clear = () => {
      highlighted?.classList.remove("tour-highlight");
      highlighted = null;
    };
    const apply = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour-step="${step.selector}"]`);
      if (!el) return;
      el.classList.add("tour-highlight");
      highlighted = el;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    // After a tab switch, wait for the target to mount before highlighting it;
    // once the class is on, the ring tracks the element through scroll/layout
    // on its own, so there's nothing to re-measure.
    const settleTimer = window.setTimeout(apply, needsSwitch ? TAB_SWITCH_SETTLE_MS : 0);
    return () => {
      window.clearTimeout(settleTimer);
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex]);

  const finish = () => {
    onClose();
  };

  if (!step) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && finish()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="tour-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              forceMount
              className={"tour-card" + (step.selector ? "" : " tour-card-centered")}
              onInteractOutside={(e) => e.preventDefault()}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
                >
                  <Dialog.Title className="card-title">
                    <Icon name="sparkles" /> {step.title}
                  </Dialog.Title>
                  <Dialog.Description className="tour-body">{step.body}</Dialog.Description>
                  <div className="tour-dots" aria-hidden="true">
                    {TOUR_STEPS.map((s, i) => (
                      <span
                        key={s.id}
                        className={`tour-dot ${i === stepIndex ? "tour-dot-active" : ""}`}
                      />
                    ))}
                  </div>
                  <div className="tour-actions">
                    <button className="btn btn-sm btn-ghost" onClick={finish}>
                      Skip
                    </button>
                    <div className="tour-actions-nav">
                      <button
                        className="btn btn-sm"
                        onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                        disabled={stepIndex === 0}
                      >
                        Back
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => (last ? finish() : setStepIndex((i) => i + 1))}
                      >
                        {last ? (
                          <>
                            <Icon name="check" /> Finish
                          </>
                        ) : (
                          <>
                            <Icon name="arrowRight" /> Next
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
