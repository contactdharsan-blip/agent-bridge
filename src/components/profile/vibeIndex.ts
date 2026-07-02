import type { MergedProfile } from "../../engineTypes";

// The eight real taskCategory enum values from skills/profile/coder_profile.schema.json
// (plus "other"), mapped to a human-readable vibecoder archetype. Purely a labeling
// layer over real merged-profile data — no invented fields, no numbers that don't
// trace back to something the merge actually computed (NFR2: honesty by design).
const ARCHETYPES: Record<string, { name: string; blurb: string }> = {
  debug: { name: "The Debugger", blurb: "Spends most sessions chasing root causes, not symptoms." },
  implement: { name: "The Builder", blurb: "Spends most sessions shipping new surface area." },
  refactor: { name: "The Refactorer", blurb: "Spends most sessions reshaping existing code, not adding to it." },
  tests: { name: "The Guardian", blurb: "Spends most sessions proving the code works, not just writing it." },
  docs: { name: "The Scribe", blurb: "Spends most sessions making the codebase legible to the next reader." },
  infra: { name: "The Operator", blurb: "Spends most sessions on the systems code runs on, not the code itself." },
  review: { name: "The Reviewer", blurb: "Spends most sessions reading and judging code over writing it." },
  explore: { name: "The Explorer", blurb: "Spends most sessions mapping unfamiliar territory before touching it." },
  other: { name: "The Generalist", blurb: "No single task category dominates — work is spread evenly." },
};

export interface VibeIndex {
  archetype: string;
  blurb: string;
  /** 0-100: confidence-weighted average of each agent's merge confidence — this is
   * how much data backs the profile, NOT a personality/quality score. Never render
   * this as the headline number (NFR2: confidence must never be blended into one
   * smooth number that reads as a verdict) — it's a labeled "profile confidence"
   * chip, same honesty rule MergedView's per-agent badges already follow. */
  confidence: number;
  topCategory: { category: string; fraction: number } | null;
  leadAgent: { agent: string; weight: number } | null;
  traits: string[];
}

/** Derives a "vibecoder personality" summary from an already-computed MergedProfile.
 * Every field here traces back to real merge output (taskMix / agents / strengths) —
 * this is a display-layer reduction, not a new source of data. Returns null for an
 * empty merge so callers can fall back to the existing empty state. */
export function computeVibeIndex(merged: MergedProfile | null): VibeIndex | null {
  if (!merged || merged.agents.length === 0) return null;

  const topCategory = merged.taskMix.reduce<{ category: string; fraction: number } | null>(
    (best, t) => (!best || t.fraction > best.fraction ? t : best),
    null,
  );
  const archetype = ARCHETYPES[topCategory?.category ?? "other"] ?? ARCHETYPES.other;

  const confidence = Math.round(
    merged.agents.reduce((sum, a) => sum + a.weight * a.confidence, 0) * 100,
  );

  const leadAgent = merged.agents.reduce<{ agent: string; weight: number } | null>(
    (best, a) => (!best || a.weight > best.weight ? { agent: a.agent, weight: a.weight } : best),
    null,
  );

  return {
    archetype: archetype.name,
    blurb: archetype.blurb,
    confidence,
    topCategory,
    leadAgent,
    traits: merged.strengths.slice(0, 3),
  };
}
