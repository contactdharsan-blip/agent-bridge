import type { TaskStatus } from "../../engineTypes";
import { Icon } from "../Icon";

// Small editors for the ContextSnapshot fields. The snapshot is assembled
// client-side and the developer confirms or trims it before the switch (UI-FR16),
// so each field is an add/remove list rather than an opaque capture.

export function StringListEditor({
  label,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  items: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="snap-field">
      <div className="snap-field-head">
        <span>{label}</span>
        <button className="btn btn-sm btn-ghost" onClick={() => onChange([...items, ""])}>
          <Icon name="plus" /> add
        </button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="snap-row">
          <input
            type="text"
            placeholder={placeholder}
            value={it}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button
            className="btn btn-sm btn-ghost icon-btn"
            aria-label={`remove ${label}`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function TaskListEditor({
  items,
  onChange,
}: {
  items: { text: string; status: TaskStatus }[];
  onChange: (next: { text: string; status: TaskStatus }[]) => void;
}) {
  return (
    <div className="snap-field">
      <div className="snap-field-head">
        <span>Task list</span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => onChange([...items, { text: "", status: "pending" }])}
        >
          <Icon name="plus" /> add
        </button>
      </div>
      {items.map((t, i) => (
        <div key={i} className="snap-row">
          <input
            type="text"
            placeholder="task"
            value={t.text}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
          />
          <select
            value={t.status}
            aria-label="task status"
            onChange={(e) =>
              onChange(
                items.map((x, j) =>
                  j === i ? { ...x, status: e.target.value as TaskStatus } : x,
                ),
              )
            }
          >
            <option value="pending">pending</option>
            <option value="inProgress">in progress</option>
            <option value="completed">completed</option>
          </select>
          <button
            className="btn btn-sm btn-ghost icon-btn"
            aria-label="remove task"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function EditsEditor({
  items,
  onChange,
}: {
  items: { file: string; hunkSummary: string }[];
  onChange: (next: { file: string; hunkSummary: string }[]) => void;
}) {
  return (
    <div className="snap-field">
      <div className="snap-field-head">
        <span>Recent edits</span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => onChange([...items, { file: "", hunkSummary: "" }])}
        >
          <Icon name="plus" /> add
        </button>
      </div>
      {items.map((e, i) => (
        <div key={i} className="snap-row">
          <input
            type="text"
            placeholder="path/to/file"
            value={e.file}
            onChange={(ev) => onChange(items.map((x, j) => (j === i ? { ...x, file: ev.target.value } : x)))}
          />
          <input
            type="text"
            placeholder="what changed"
            value={e.hunkSummary}
            onChange={(ev) =>
              onChange(items.map((x, j) => (j === i ? { ...x, hunkSummary: ev.target.value } : x)))
            }
          />
          <button
            className="btn btn-sm btn-ghost icon-btn"
            aria-label="remove edit"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
    </div>
  );
}
