import { useScrollToRow } from "../../shared/hooks/useScrollToRow";
import { cn } from "../../shared/cn";
import type { CoursePointType } from "../../shared/fit";
import type { EditorPoint } from "../../shared/fitDraft";
import { Button } from "../../shared/ui/Button";
import { CommitInput, Select } from "../../shared/ui/Input";
import {
  NAME_BYTES,
  TYPE_OPTIONS,
  byteLength,
  glyphOf,
  typeLabel,
} from "./types";

type Props = {
  points: EditorPoint[];
  selected: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, change: Partial<EditorPoint>) => void;
  onDelete: (id: string) => void;
};

export function PointList({
  points,
  selected,
  onSelect,
  onChange,
  onDelete,
}: Props) {
  const selectedIdx = points.findIndex((p) => p.id === selected);
  const rowRef = useScrollToRow(selectedIdx < 0 ? null : selectedIdx);

  if (!points.length)
    return (
      <p className="m-3 text-ink-muted">
        No course points. Right-click the map near the route to add one.
      </p>
    );

  return (
    <ol className="m-0 list-none p-0" aria-label="Course points">
      {points.map((p, i) => {
        const bytes = byteLength(p.name);
        return (
          <li
            key={p.id}
            ref={rowRef(i)}
            aria-current={p.id === selected || undefined}
            className={cn(
              "grid grid-cols-[24px_1fr_auto] items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2",
              p.id === selected && "bg-green-soft",
            )}
            onClick={() => onSelect(p.id)}
          >
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-full bg-surface-sunken font-bold"
            >
              {glyphOf(p.type)}
            </span>
            <Select
              aria-label={`Type of course point ${i + 1}`}
              className="h-8"
              value={p.type}
              onChange={(e) =>
                onChange(p.id, {
                  type: Number(e.target.value) as CoursePointType,
                })
              }
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <span className="code text-right text-ink-muted tabular-nums">
              {(p.distance / 1000).toFixed(2)} km
            </span>
            <span />
            <div className="relative">
              <CommitInput
                aria-label={`Name of course point ${i + 1}`}
                aria-invalid={bytes > NAME_BYTES || undefined}
                className="h-8 pr-12"
                placeholder={typeLabel(p.type)}
                value={p.name}
                onCommit={(name) => onChange(p.id, { name })}
              />
              <span
                className={cn(
                  "code pointer-events-none absolute top-1.5 right-2 text-[12px]",
                  bytes > NAME_BYTES ? "text-danger" : "text-ink-subtle",
                )}
                title="Bytes of the 15 the name field holds; the rest is cut off"
              >
                {bytes}/{NAME_BYTES}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete course point ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id);
              }}
            >
              Delete
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
