import type { Decision, PendingPermission } from "../types";

/** A non-diff permission ask (e.g. a shell-command approval) — UI-FR06's
 * generic counterpart to `DiffHunk`. Reuses the same diff-hunk chrome (header
 * + actions) since it's the same "one blocking decision" shape, just without
 * a diff body to render. */
export function PermissionAsk({
  permission,
  onResolve,
}: {
  permission: PendingPermission;
  onResolve: (decision: Decision) => void;
}) {
  return (
    <div className="diff-hunk">
      <div className="diff-header">
        <span className="diff-path">{permission.description}</span>
      </div>
      <div className="diff-actions">
        <button className="btn btn-accept" onClick={() => onResolve("accept")}>
          Approve
        </button>
        <button className="btn btn-reject" onClick={() => onResolve("reject")}>
          Deny
        </button>
      </div>
    </div>
  );
}
