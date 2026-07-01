import type { CoderProfile } from "../../engineTypes";

// The Profile Skill runs *inside* an agent session (there is no run_profile
// command) — it uses that agent's own model and reads local history, so only the
// aggregate JSON ever leaves the session (UI-FR19/26, NFR1). This is the invoking
// prompt; the emitted JSON is captured from the stream and validated at the boundary.
export const PROFILE_PROMPT = `Run the "profile" skill for this project: analyze my recent local coding history and emit a single CoderProfile JSON object conforming to the profile schema (fields: schemaVersion, agent, data{sessionsAnalyzed,daysCovered,messagesAnalyzed}, taskMix, frictionPoints, repeatedInstructions, toolUsage, efficiency, strengths, agentAffinity, signatures). Output ONLY the JSON object — no prose, no code fences.`;

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
