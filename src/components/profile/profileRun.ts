import type { CoderProfile } from "../../engineTypes";

// The Profile Skill runs *inside* an agent session (there is no run_profile
// command) — it uses that agent's own model and reads local history, so only the
// aggregate JSON ever leaves the session (UI-FR19/26, NFR1). This is the invoking
// prompt; the emitted JSON is captured from the stream and validated at the boundary.

/** FR40: how much local history the skill is asked to read. "recent" is a
 * bounded, cheap scan; "deep" asks for everything available — a real, larger
 * agent-side token cost (the skill then reads history in-session, which this
 * app can't meter), so it's an explicit opt-in, never silently substituted. */
export type ProfileDepth = "recent" | "deep";

/** Explicit assumption (stated, not asked, per the /goal autonomous-directive
 * + Ask-Once rule): "recent" as the default, matching this app's other
 * cost-conscious defaults (e.g. BYOK-first auth, the 2-tier permission
 * presets) — a deep scan trades real extra cost for richer signal and should
 * be a deliberate choice, not the thing that happens if you click too fast.
 * The default history window's exact length (operator-todo.md flags this) is
 * left to each agent's own judgment via the prompt wording below, not a hard
 * day count this app enforces — the skill has no host-side mechanism to cap
 * what an agent reads inside its own session. */
export const DEFAULT_PROFILE_DEPTH: ProfileDepth = "recent";

const DEPTH_SCOPE: Record<ProfileDepth, string> = {
  recent: "your most recent local coding history (roughly the last week or two — less if that's all you have)",
  deep: "as much of your available local coding history as you can find and read — do not artificially limit yourself to a recent window",
};

export function buildProfilePrompt(depth: ProfileDepth = DEFAULT_PROFILE_DEPTH): string {
  return `Run the "profile" skill for this project: analyze ${DEPTH_SCOPE[depth]} and emit a single CoderProfile JSON object conforming to the profile schema (fields: schemaVersion, agent, data{sessionsAnalyzed,daysCovered,messagesAnalyzed}, taskMix, frictionPoints, repeatedInstructions, toolUsage, efficiency, strengths, agentAffinity, signatures). Output ONLY the JSON object — no prose, no code fences.`;
}

// Mirrors the bundled source in crates/profile/src/gapfill.rs — the public,
// reviewable home of the skill this panel runs (FR22b: review the source
// before installing anything).
export const PROFILE_SKILL_REPO_URL = "https://github.com/contactdharsan-blip/agent-bridge-profile-skill";

/** Pull the first balanced-looking JSON object out of a possibly-chatty reply so
 * it can be handed to validate_profile. Returns null if there's no object. */
export function extractJson(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/** The per-agent profile with the most analyzed messages — recommend_features
 * takes one CoderProfile, so the dominant sample is the honest choice. */
export function dominantProfile(profiles: CoderProfile[]): CoderProfile | null {
  if (profiles.length === 0) return null;
  return profiles.reduce((best, p) =>
    p.data.messagesAnalyzed > best.data.messagesAnalyzed ? p : best,
  );
}
