import type { ReactNode } from "react";
import { cn } from "../../shared/cn";
import { Button } from "../../shared/ui/Button";
import { DEFAULT_OFF, type Section } from "./attributes";
import { click, type Marks } from "./marks";

type Props = {
  label: string;
  sections: Section[];
  marks: Marks;
  onMarks: (marks: Marks) => void;
  onMove: (names: string[]) => void;
  moveLabel: string;
  empty: string;
  /** e.g. an item adding a custom attribute */
  first?: ReactNode;
};

const ITEM =
  "flex cursor-pointer justify-between gap-2 border-b border-line px-4 py-1 select-none hover:bg-surface-sunken";

export function AttributeList({
  label,
  sections,
  marks,
  onMarks,
  onMove,
  moveLabel,
  empty,
  first,
}: Props) {
  const shown = sections.flatMap((section) => section.attributes);

  return (
    <ul
      aria-label={label}
      className="code m-0 flex-1 list-none overflow-y-auto p-0"
    >
      {first}
      {!first && !shown.length && (
        <li className="p-4 font-sans text-ink-muted">{empty}</li>
      )}
      {sections.map((section) => [
        <li
          key={`group:${section.name}`}
          className="label sticky top-0 flex items-center justify-between bg-surface-sunken py-1 pr-2 pl-4"
        >
          {section.name}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMove(section.attributes)}
          >
            {moveLabel}
          </Button>
        </li>,
        ...section.attributes.map((name) => (
          <li
            key={name}
            data-marked={marks.marked.has(name) || undefined}
            className={cn(
              ITEM,
              marks.marked.has(name) &&
                "bg-magenta-soft text-magenta-ink hover:bg-magenta-soft",
            )}
            onClick={(e) => {
              const result = click(marks, name, shown, e);
              if ("move" in result) onMove(result.move);
              else onMarks(result.marks);
            }}
          >
            <span>{name}</span>
            {DEFAULT_OFF.has(name) && (
              <small className="flex-none font-sans text-ink-muted">
                off by default
              </small>
            )}
          </li>
        )),
      ])}
    </ul>
  );
}

export function ExtraItem({
  children,
  note,
  onClick,
}: {
  children: ReactNode;
  note: string;
  onClick: () => void;
}) {
  return (
    <li className={ITEM} onClick={onClick}>
      <span>{children}</span>
      <small className="flex-none font-sans text-ink-muted">{note}</small>
    </li>
  );
}
