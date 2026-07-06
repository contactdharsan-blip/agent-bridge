import type { McpProjection, ProjectionWarning, Target } from "../../engineTypes";
import { Icon } from "../Icon";
import type { AsyncState } from "./hooks";
import { TARGET_FILE } from "./targets";

// Read-only preview of a target's projected MCP config (UI-FR10), with the
// cumulative tool count and the Cursor ~40-tool ceiling warning surfaced inline
// before any write (UI-FR11).

function warningText(w: ProjectionWarning): string {
  if (w.code === "cursorToolCeiling")
    return `Cursor tool ceiling: ${w.total} tools exceeds the ~${w.ceiling} limit — some tools will be dropped.`;
  return `Unknown tool counts for: ${w.servers.join(", ")} — the cumulative total may be under-counted.`;
}

export function McpPreview({
  target,
  state,
}: {
  target: Target;
  state: AsyncState<McpProjection>;
}) {
  const { data, loading, error } = state;

  return (
    <section className="preview-block">
      <header className="preview-head">
        <span className="preview-file">
          <Icon name="config" /> {TARGET_FILE[target]}
        </span>
        {/* Placeholder while projecting — the header row otherwise shifts
            every time the badge pops in after a re-projection. */}
        <span
          className={`badge ${data?.warnings.some((w) => w.code === "cursorToolCeiling") ? "badge-warning" : "badge-neutral"}`}
        >
          {data ? `${data.toolCount} tools` : "…"}
        </span>
      </header>

      {loading && !data && <div className="skeleton skeleton-block" aria-label="projecting" />}
      {error && (
        <div className="callout callout-error">
          <Icon name="x" /> Projection failed: {error}
        </div>
      )}

      {data && (
        <>
          {data.warnings.map((w, i) => (
            <div key={i} className="callout callout-warning">
              <Icon name="alert" /> {warningText(w)}
            </div>
          ))}
          <pre className="code-preview">{data.contents}</pre>
        </>
      )}
    </section>
  );
}
