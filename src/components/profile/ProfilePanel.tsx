import { useEffect, useRef, useState } from "react";
import {
  gapFillsFor,
  mergeProfiles,
  recommendFeatures,
  validateProfile,
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
import { useToast } from "../../state/toast";
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
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
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

  // Export/import (UI-FR33): aggregate JSON only — never transcripts or source.
  // Import runs every profile through validate_profile, so a corrupt file is
  // rejected at the boundary exactly like a fresh run.
  const exportProfiles = () => {
    const payload = JSON.stringify({ profiles, merged }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-bridge-profile.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.push("success", "Exported profile JSON");
  };

  const importProfiles = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const list: unknown[] = Array.isArray(parsed) ? parsed : (parsed?.profiles ?? []);
      let n = 0;
      for (const p of list) {
        addProfile(await validateProfile(JSON.stringify(p)));
        n += 1;
      }
      toast.push(n ? "success" : "info", n ? `Imported ${n} profile(s)` : "No profiles in file");
    } catch (e) {
      toast.push("error", `Import rejected at the boundary: ${e}`);
    }
  };

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
        <div className="profile-toolbar">
          <button className="btn btn-sm" onClick={exportProfiles} disabled={profiles.length === 0}>
            <Icon name="arrowRight" /> Export
          </button>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            <Icon name="plus" /> Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importProfiles(f);
              e.target.value = "";
            }}
          />
        </div>
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
