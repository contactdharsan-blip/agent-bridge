// FR41: dismiss/curate friction patterns. Purely a local display preference
// (there's no backend command for this — frictionPoints is emitted fresh by
// every profile run) — dismissing hides a pattern from the Merged view going
// forward without touching the underlying data, and stays reversible so it's
// never a silent black hole.

import type { FrictionPattern } from "../engineTypes";
import { load, save } from "./persist";

const KEY = "settings.dismissedFrictionPatterns";

export function getDismissedFriction(): FrictionPattern[] {
  return load<FrictionPattern[]>(KEY, []);
}

export function isFrictionDismissed(pattern: FrictionPattern): boolean {
  return getDismissedFriction().includes(pattern);
}

export function dismissFriction(pattern: FrictionPattern): void {
  const current = getDismissedFriction();
  if (!current.includes(pattern)) save(KEY, [...current, pattern]);
}

export function undismissFriction(pattern: FrictionPattern): void {
  save(KEY, getDismissedFriction().filter((p) => p !== pattern));
}
