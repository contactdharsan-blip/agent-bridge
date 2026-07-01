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
import { dominantProfile, PROFILE_SKILL_REPO_URL } from "./profileRun";

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
  // Default the continuity target to the agent with the most collected data
  // rather than a hardcoded one, so it reflects what the user actually profiled.
  const [target, setTarget] = useState<Agent>(() => dominantProfile(profiles)?.agent ?? "claude");

  const [merged, setMerged] = useState<MergedProfile | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
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

  // Merge + recommendations recompute when the collected set changes — keyed on the
  // full profile content, so replacing a same-agent/same-count profile with edited
  // content doesn't leave the merge (and its per-agent confidence) stale.
  const profileKey = JSON.stringify(profiles);
  useEffect(() => {
    if (profiles.length === 0) {
      setMerged(null);
      setMergeError(null);
      setRecs(null);
      return;
    }
    let cancelled = false;
    mergeProfiles(profiles)
      .then((m) => {
        if (!cancelled) {
          setMerged(m);
          setMergeError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setMerged(null);
          setMergeError(String(e));
        }
      });
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
      <div className="profile-collect-col" data-tour-step="profile-collector">
        <div className="profile-toolbar" data-tour-step="profile-toolbar">
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
        <a
          className="btn btn-sm btn-ghost"
          data-tour-step="skill-repo-link"
          href={PROFILE_SKILL_REPO_URL}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="arrowRight" /> View the Profile Skill source
        </a>
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
        ) : mergeError ? (
          <PanelEmpty
            icon="alert"
            tone="error"
            title="Couldn't merge the collected profiles"
            hint={mergeError}
          />
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
