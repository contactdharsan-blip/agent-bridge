import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { TOUR_STEPS } from "../data/tourSteps";
import { prefersReducedMotion } from "../state/motion";
import { Icon } from "./Icon";

// Must exceed the point where the incoming panel mounts during App.tsx's
// fade-through tab switch (exit 0.08s, then the target exists while its 0.18s
// entry fade plays) so the target element is in the DOM before we highlight it.
const TAB_SWITCH_SETTLE_MS = 300;

// A supplementary first-launch guided walkthrough — teaches by spotlighting
// the real UI once. This is NOT what satisfies UI-FR28: the PRD reuses that
// id for two different specs (§6's command-calling wizard — list_agents,
// preview_mcp, check_drift, audit_secret_bindings, start_session,
// validate_profile, etc. — and §11's addendum, an inline, dismissable,
// never-a-modal-wall first-run checklist). This component calls none of §6's
// commands (it only narrates + drives tab/DOM), and it IS a blocking Radix
// dialog (see below), so it satisfies neither — OnboardingCard.tsx is the one
// that actually matches §11's addendum (inline checklist, real list_agents/
// run_doctor/audit_secret_bindings calls, dismissable, never a modal). The
// two coexist deliberately: this tour teaches once, OnboardingCard stays as
// the ongoing checklist.
//
// Being a modal here is a deliberate, scoped choice for THIS feature (not a
// violation of a spec this component doesn't claim): dismissal is
// Skip/Finish/Escape only — a multi-step teaching flow shouldn't discard
// progress on a stray backdrop click — but every real exit stays reachable
// (Escape still closes it via Dialog's own onOpenChange; only outside-click
// is suppressed). It drives the real tab underneath itself (via onTabChange)
// and spotlights the real DOM element for each step (via data-tour-step) —
// never a mock screenshot.
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
  // Target not in the DOM (e.g. thread/composer before a session connects) →
  // fall back to a centered card instead of pointing at empty space.
  const [missing, setMissing] = useState(false);
  // Dock the card to the side opposite the target so it never covers it.
  const [cardSide, setCardSide] = useState<"right" | "left">("right");
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const step = TOUR_STEPS[stepIndex];
  const last = stepIndex === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (!open || !step) return;
    const needsSwitch = step.tab !== tab;
    if (needsSwitch) onTabChange(step.tab);
    setMissing(false);
    if (!step.selector) return;

    let highlighted: HTMLElement | null = null;
    const clear = () => {
      highlighted?.classList.remove("tour-highlight");
      highlighted = null;
    };
    const apply = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour-step="${step.selector}"]`);
      if (!el) {
        setMissing(true);
        return;
      }
      el.classList.add("tour-highlight");
      highlighted = el;
      // Dock the card to the side opposite the target's half so it never
      // covers the element it spotlights (e.g. the tall right-column
      // config-preview / handoff-diff panels).
      const r = el.getBoundingClientRect();
      setCardSide(r.left + r.width / 2 > window.innerWidth / 2 ? "left" : "right");
      // Gate the native smooth scroll on the OS reduced-motion preference —
      // MotionConfig (framer-only) and the CSS prefers-reduced-motion block
      // can't reach a JS scrollIntoView.
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
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

  // Focus the primary action whenever the step changes, so Enter advances
  // the tour instead of landing wherever focus last was.
  useEffect(() => {
    primaryRef.current?.focus();
  }, [stepIndex]);

  const finish = () => {
    onClose();
  };
  const goNext = () => (last ? finish() : setStepIndex((i) => i + 1));
  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  if (!step) return null;

  return (
    // Native Radix mount/unmount (no forceMount, no AnimatePresence): this app's
    // framer-motion transitions were found to never fire their completion —
    // confirmed by the overlay and first-step content both permanently pinned
    // at their `initial` keyframe, and by "Skip"/"Finish" leaving a dead but
    // still-`pointer-events:auto` Dialog.Content mounted forever waiting on an
    // exit animation that never resolves (blocking clicks under the ghost
    // card indefinitely). Radix's own open-driven mount/unmount has no such
    // dependency, at the cost of the fade/scale transitions this used to have.
    <Dialog.Root open={open} onOpenChange={(o) => !o && finish()}>
      <Dialog.Portal>
        <Dialog.Overlay className="tour-overlay" />
        <Dialog.Content
          className={
            "tour-card" +
            (!step.selector || missing
              ? " tour-card-centered"
              : cardSide === "left"
                ? " tour-card-left"
                : "")
          }
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              goNext();
            } else if (e.key === "ArrowLeft" && stepIndex > 0) {
              e.preventDefault();
              goBack();
            }
          }}
        >
          <div key={step.id}>
            <Dialog.Title className="card-title">
              <Icon name="sparkles" /> {step.title}
            </Dialog.Title>
            <Dialog.Description className="tour-body">{step.body}</Dialog.Description>
            <div
              className="tour-dots"
              role="img"
              aria-label={`Step ${stepIndex + 1} of ${TOUR_STEPS.length}`}
            >
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
                <button className="btn btn-sm" onClick={goBack} disabled={stepIndex === 0}>
                  Back
                </button>
                <button ref={primaryRef} className="btn btn-primary btn-sm" onClick={goNext}>
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
