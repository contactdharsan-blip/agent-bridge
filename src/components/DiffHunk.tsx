import type { Decision, PendingEdit } from "../types";

/** A minimal line diff: removed lines from oldText, added lines from newText. */
function lines(text: string | null): string[] {
  if (!text) return [];
  return text.replace(/\n$/, "").split("\n");
}

export function DiffHunk({
  edit,
  onResolve,
}: {
  edit: PendingEdit;
  onResolve: (decision: Decision) => void;
}) {
  const removed = lines(edit.oldText);
  const added = lines(edit.newText);

  return (
    <div className="diff-hunk">
      <div className="diff-header">
        <span className="diff-path">{edit.path}</span>
        {edit.oldText === null && <span className="diff-badge">new file</span>}
      </div>
      <pre className="diff-body">
        {removed.map((l, i) => (
          <div key={`r${i}`} className="diff-line diff-removed">
            - {l}
          </div>
        ))}
        {added.map((l, i) => (
          <div key={`a${i}`} className="diff-line diff-added">
            + {l}
          </div>
        ))}
      </pre>
      <div className="diff-actions">
        <button className="btn btn-accept" onClick={() => onResolve("accept")}>
          Accept
        </button>
        <button className="btn btn-reject" onClick={() => onResolve("reject")}>
          Reject
        </button>
      </div>
    </div>
  );
}
