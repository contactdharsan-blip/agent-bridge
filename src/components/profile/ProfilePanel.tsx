import { useEffect, useState } from "react";
import {
  gapFillsFor,
  mergeProfiles,
  recommendFeatures,
  workflowContinuity,
} from "../../engines";
import type {
  Agent,
  CoderProfile,
  ContinuityReport,
  GapFill,
  MergedProfile,
  Recommendation,
} from "../../engineTypes";
import type { AgentStream } from "../../hooks/useAgentStream";
import { useCanonical } from "../../state/canonical";
import { load, save } from "../../state/persist";
import type { AsyncState } from "../config/hooks";
import { Icon } from "../Icon";
import { PanelEmpty } from "../PanelEmpty";
import { ContinuityView } from "./ContinuityView";
import { MergedView } from "./MergedView";
import { ProfileCollector } from "./ProfileCollector";
import { dominantProfile } from "./profileRun";

const EMPTY: AsyncState<never> = { data: null, loading: false, error: null };

// Profile & Continuity dashboard (UI-FR19–26). Collect per-agent profiles (left),
// merge with per-agent confidence, then turn the merge into recommendations, a
// four-bucket continuity report, and reviewable gap-fills (right). Local-first:
// only aggregate JSON ever leaves a session.
export function ProfilePanel({ stream }: { stream: AgentStream }) {
  const store = useCanonical();
  // Persisted so collected profiles survive both a tab switch (the panel unmounts)
  // and a reload (UI-FR30).
  const [profiles, setProfiles] = useState<CoderProfile[]>(() =>
    load<CoderProfile[]>("profiles", []),
  );
  useEffect(() => {
    save("profiles", profiles);
  }, [profiles]);
  const [target, setTarget] = useState<Agent>("codex");

  const [merged, setMerged] = useState<MergedProfile | null>(null);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [continuity, setContinuity] = useState<AsyncState<ContinuityReport>>(EMPTY);
  const [gapFills, setGapFills] = useState<AsyncState<GapFill[]>>(EMPTY);

  const addProfile = (p: CoderProfile) =>
    setProfiles((prev) => [...prev.filter((x) => x.agent !== p.agent), p]);
  const removeProfile = (agent: string) =>
    setProfiles((prev) => prev.filter((x) => x.agent !== agent));

  // Merge + recommendations recompute when the collected set changes.
  const profileKey = JSON.stringify(profiles.map((p) => `${p.agent}:${p.data.messagesAnalyzed}`));
  useEffect(() => {
    if (profiles.length === 0) {
      setMerged(null);
      setRecs(null);
      return;
    }
    let cancelled = false;
    mergeProfiles(profiles)
      .then((m) => !cancelled && setMerged(m))
      .catch(() => !cancelled && setMerged(null));
    const dom = dominantProfile(profiles);
    setRecs(null);
    if (dom) {
      recommendFeatures(dom)
        .then((r) => !cancelled && setRecs(r))
        .catch(() => !cancelled && setRecs([]));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey]);

  // Continuity + gap-fills recompute when the merge, target, or canonical store change.
  const canonical = store.toCanonical();
  const canonicalKey = JSON.stringify(canonical);
  useEffect(() => {
    if (!merged) {
      setContinuity(EMPTY);
      setGapFills(EMPTY);
      return;
    }
    let cancelled = false;
    setContinuity({ data: null, loading: true, error: null });
    workflowContinuity(target, canonical, merged)
      .then((d) => !cancelled && setContinuity({ data: d, loading: false, error: null }))
      .catch((e) => !cancelled && setContinuity({ data: null, loading: false, error: String(e) }));
    setGapFills({ data: null, loading: true, error: null });
    gapFillsFor(target, merged)
      .then((d) => !cancelled && setGapFills({ data: d, loading: false, error: null }))
      .catch((e) => !cancelled && setGapFills({ data: null, loading: false, error: String(e) }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, target, canonicalKey]);

  return (
    <div className="profile-panel">
      <div className="profile-collect-col">
        <div className="callout callout-honesty local-first-note">
          <Icon name="shield" />
          <span>Stays on this machine — only aggregate profile JSON, never transcripts or source.</span>
        </div>
        <ProfileCollector
          stream={stream}
          collected={profiles}
          onAdd={addProfile}
          onRemove={removeProfile}
        />
      </div>

      <div className="profile-result-col">
        {merged ? (
          <>
            <MergedView merged={merged} recommendations={recs} />
            <ContinuityView
              target={target}
              onTarget={setTarget}
              continuity={continuity}
              gapFills={gapFills}
            />
          </>
        ) : (
          <PanelEmpty
            icon="user"
            title="No profile yet"
            hint="Run the profile skill in an agent (or paste its JSON) on the left. It runs on that agent's own model over local history — the merge shows per-agent confidence so a thin profile is never hidden."
          />
        )}
      </div>
    </div>
  );
}
