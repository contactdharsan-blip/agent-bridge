// Shared reduced-motion check for the JS-driven scrolls/animations that CSS's
// prefers-reduced-motion media query block (App.css) can't reach on its own
// (ThreadView's scrollIntoView, OnboardingTour's spotlight scroll). Optional-
// chains matchMedia so jsdom (npm test) doesn't throw.
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// ---- Shared framer-motion vocabulary -----------------------------------------
// One set of named transitions so framer code speaks the same language as the
// CSS tokens (--transition-fast/base/spring). Springs move things; tweens fade
// things. All of these ride the root MotionConfig reducedMotion="user" gate.

import type { Transition } from "framer-motion";

/** Indicators and layout shifts (tab pill, list reflow) — settles fast, no overshoot. */
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 500, damping: 40 };

/** The sliding active-tab pill — slightly softer so travel reads as deliberate. */
export const SPRING_PILL: Transition = { type: "spring", stiffness: 380, damping: 32 };

/** Fades and small reveals. */
export const FADE: Transition = { duration: 0.15, ease: "easeOut" };

/** Tab-panel fade-through: exit fast… */
export const PANEL_EXIT: Transition = { duration: 0.08, ease: "easeIn" };
/** …then enter slower, easing out (enters ease-out, exits ease-in). */
export const PANEL_ENTER: Transition = { duration: 0.18, ease: "easeOut" };
