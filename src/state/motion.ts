// Shared reduced-motion check for the JS-driven scrolls/animations that CSS's
// prefers-reduced-motion media query block (App.css) can't reach on its own
// (ThreadView's scrollIntoView, OnboardingTour's spotlight scroll). Optional-
// chains matchMedia so jsdom (npm test) doesn't throw.
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
