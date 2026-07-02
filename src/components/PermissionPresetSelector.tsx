import type { PermissionPreset } from "../state/permissionPresets";

// Per-project default for resolving EditHunk permission requests (FR31). Two
// tiers only, by design — see the comment on `PermissionPreset` for why there's
// no third "bypass" tier: the frozen ACP-host contract has nothing more
// destructive to bypass than a file-content edit.
export function PermissionPresetSelector({
  preset,
  disabled,
  onChange,
}: {
  preset: PermissionPreset;
  disabled?: boolean;
  onChange: (preset: PermissionPreset) => void;
}) {
  return (
    <label className="preset-field" title="Per-project default for resolving file-edit requests">
      Permissions
      <select
        value={preset}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as PermissionPreset)}
      >
        <option value="default">Ask every time</option>
        <option value="acceptEdits">Auto-accept edits</option>
      </select>
    </label>
  );
}
