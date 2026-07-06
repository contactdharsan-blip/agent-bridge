import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { SPRING_PILL } from "../state/motion";
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
            {/* One shared layoutId means the lit pill *slides* between triggers
                instead of blinking off/on; under reduced motion it snaps. The
                pill carries the active visuals so the trigger's own box never
                changes size (no 1px-border jiggle on siblings). */}
            {active === t.id && (
              <motion.span
                layoutId="tab-pill"
                className="tab-pill"
                transition={SPRING_PILL}
                aria-hidden="true"
              />
            )}
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}
