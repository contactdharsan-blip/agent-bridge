import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

// The designed "nothing here yet" / degraded state every panel reuses so no async
// boundary ever renders as a blank div (UI-NFR5). Honest by construction: the hint
// says what the state actually is, never a fake-success placeholder.
export function PanelEmpty({
  icon,
  title,
  hint,
  tone = "neutral",
  children,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  tone?: "neutral" | "warning" | "error";
  children?: ReactNode;
}) {
  return (
    <div className={`panel-empty panel-empty-${tone}`}>
      <div className="panel-empty-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {children}
    </div>
  );
}
