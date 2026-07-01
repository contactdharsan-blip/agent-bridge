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
  // A group of buttons with aria-current, not a role="tablist" — declaring the tab
  // role would promise APG arrow-key/roving-tabindex behavior this doesn't implement.
  return (
    <div className="tabbar" role="group" aria-label="Panels">
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            aria-current={selected ? "page" : undefined}
            className={`tab ${selected ? "tab-active" : ""}`}
            onClick={() => onChange(t.id)}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
