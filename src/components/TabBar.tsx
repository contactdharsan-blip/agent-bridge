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
  return (
    <div className="tabbar" role="tablist" aria-label="Panels">
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
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
