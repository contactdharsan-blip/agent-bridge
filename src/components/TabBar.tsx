import * as Tabs from "@radix-ui/react-tabs";
import { Icon, type IconName } from "./Icon";

// Top navigation, styled as the design system's glass "segmented control" (§7.4):
// one glass track, the active tab lifted into a lit pill. Panels are chosen by id
// only — the shell has no per-agent or per-panel special-casing.
export interface TabDef {
  id: string;
  label: string;
  icon: IconName;
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  // Radix owns the APG tablist pattern (roving tabindex, arrow-key nav, aria-selected)
  // that the hand-rolled version deliberately opted out of — see git history.
  return (
    <Tabs.Root value={active} onValueChange={onChange}>
      <Tabs.List className="tabbar" aria-label="Panels">
        {tabs.map((t) => (
          <Tabs.Trigger key={t.id} value={t.id} className="tab">
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
