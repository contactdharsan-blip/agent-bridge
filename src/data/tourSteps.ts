// Data only, no JSX — the first-launch guided walkthrough (deferred UI-FR28,
// now built). Each step optionally targets a `data-tour-step="<selector>"`
// element; steps without a `selector` render as a centered card. `tab` drives
// OnboardingTour to switch the app's active tab before it looks for the
// target, so the user always sees the real UI behind the tour, never a mock.
export interface TourStep {
  id: string;
  tab: string;
  selector?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    tab: "run",
    title: "Welcome to Agent Bridge",
    body: "One shell for Claude Code, Codex, and Cursor. This walkthrough shows exactly what to do on each tab — takes under a minute. You can skip anytime and replay it later from the command palette or the info button up top.",
  },
  {
    id: "agent-picker",
    tab: "run",
    selector: "agent-picker",
    title: "Connect an agent",
    body: "Pick an agent and a working directory, then hit Connect. No Agent Bridge API key needed — if you're already signed into that agent (subscription or key), it just works. Its badge shows whether a key or your own agent login is in use.",
  },
  {
    id: "thread",
    tab: "run",
    selector: "thread",
    title: "One thread for every agent",
    body: "Messages, tool calls, and edit hunks render the same way no matter which agent is connected — there's nothing agent-specific to learn here.",
  },
  {
    id: "composer",
    tab: "run",
    selector: "composer",
    title: "Send prompts, cancel anytime",
    body: "Type here and send. While a turn is in flight, Stop is always reachable — cancelling never leaves you guessing whether it actually stopped.",
  },
  {
    id: "target-selector",
    tab: "config",
    selector: "target-selector",
    title: "Project your config to any agent",
    body: "Edit your MCP servers and instructions once on the left, then pick a target here (Claude, Codex, or Cursor) to see exactly what gets written in that agent's native format.",
  },
  {
    id: "config-preview",
    tab: "config",
    selector: "config-preview",
    title: "Review before it's real",
    body: "The preview re-projects live as you edit — nothing touches disk. When you're ready to apply, the Drift review card below is a blocking gate: it reads the on-disk file and compares it with the projection automatically, and real drift must be explicitly acknowledged before anything is overwritten. That's how a hand-edited native file is never silently clobbered.",
  },
  {
    id: "handoff-target-row",
    tab: "handoff",
    selector: "handoff-target-row",
    title: "Switching agents mid-task",
    body: "Pick the agent you're switching to. Agent Bridge captures a snapshot of what you were doing so the next agent doesn't start cold.",
  },
  {
    id: "handoff-diff",
    tab: "handoff",
    selector: "handoff-diff",
    title: "A reconstructed brief, not a continued session",
    body: "This carry-diff is the honest part: live conversation memory can't be migrated between agents, only bridged. You see exactly what's carried over and what isn't before you switch.",
  },
  {
    id: "profile-collector",
    tab: "profile",
    selector: "profile-collector",
    title: "Building your coder profile",
    body: "All you do here: run the profile skill inside a connected agent (it runs live, using that agent's own model), or paste the JSON it emits if you ran it elsewhere. Either way, only the aggregate profile ever leaves the session — never transcripts or source.",
  },
  {
    id: "profile-toolbar",
    tab: "profile",
    selector: "profile-toolbar",
    title: "Export and import",
    body: "Save your merged profile to a file, or bring one in from another machine. Every import is validated at the boundary, so a corrupt file is rejected exactly like a fresh run would reject bad JSON.",
  },
  {
    id: "skill-repo-link",
    tab: "profile",
    selector: "skill-repo-link",
    title: "The skill itself is public",
    body: "The profile skill Agent Bridge runs is open source — review it before you trust it. That's the whole tour. Come back to this anytime via ⌘K → Replay walkthrough.",
  },
];
