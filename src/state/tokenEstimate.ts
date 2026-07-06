// Upfront token-cost honesty. Every place the app is about to send text to an
// agent (composer, profile run, agent-drafted snapshot, handoff brief) shows
// what that send roughly costs BEFORE it happens. This is a client-side
// heuristic (~4 chars/token, the common English-text rule of thumb) — each
// agent tokenizes differently and the response side is unknowable upfront, so
// the UI must always frame this as an estimate, never a billed figure (NFR2).

/** Rough prompt-token estimate: ~4 characters per token, minimum 1 for any
 * non-empty text. Whitespace counts — it costs tokens too. */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Compact display form: 999 → "999", 1200 → "1.2k", 25400 → "25k". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}

/** The one honest framing, shared verbatim by every surface that shows an
 * estimate — so no call site quietly drifts into implying precision. */
export const TOKEN_ESTIMATE_NOTE =
  "rough estimate (~4 chars/token) — actual tokenization and the response size vary by agent";
