import { useEffect, useRef, useState } from "react";
import { cn } from "../../shared/cn";
import { WayLinks } from "../../shared/valhalla/WayLinks";
import { pretty } from "./request";
import type { Row, Section } from "./results";

type Props = {
  sections: Section[];
  highlighted: number | null;
  onHover: (idx: number | null) => void;
};

/** The correlated edges and nodes, under the location they were found for. */
export function ResultList({ sections, highlighted, onHover }: Props) {
  const rows = useRef(new Map<number, HTMLElement>());

  // follow what the map highlights
  useEffect(() => {
    if (highlighted !== null)
      rows.current.get(highlighted)?.scrollIntoView?.({ block: "nearest" });
  }, [highlighted]);

  return (
    <ul aria-label="Results" className="m-0 list-none p-0">
      {sections.map((section) => [
        <li
          key={`location:${section.location}`}
          className="label sticky top-0 z-[1] flex items-center gap-2 bg-surface-sunken px-3 py-2"
        >
          <span
            className="size-2.5 flex-none rounded-full"
            style={{ background: section.color }}
          />
          Location {section.location + 1}
          <small className="caption text-ink-muted">{section.summary}</small>
        </li>,
        ...section.rows.map((row) => (
          <li key={row.idx}>
            <ResultRow
              ref={(element) => {
                if (element) rows.current.set(row.idx, element);
                else rows.current.delete(row.idx);
              }}
              row={row}
              color={section.color}
              active={row.idx === highlighted}
              onHover={onHover}
            />
          </li>
        )),
      ])}
    </ul>
  );
}

type RowProps = {
  ref: (element: HTMLElement | null) => void;
  row: Row;
  color: string;
  active: boolean;
  onHover: (idx: number | null) => void;
};

function ResultRow({ ref, row, color, active, onHover }: RowProps) {
  // verbose edges are large, so only render the JSON of those that get opened
  const [opened, setOpened] = useState(false);

  return (
    <details
      ref={ref}
      className={cn(
        "border-b border-l-4 border-b-line hover:bg-surface-sunken",
        active && "bg-magenta-soft hover:bg-magenta-soft",
      )}
      style={{ borderLeftColor: color }}
      onToggle={(e) => e.currentTarget.open && setOpened(true)}
      onMouseEnter={() => onHover(row.idx)}
      onMouseLeave={() => onHover(null)}
    >
      <summary className="label cursor-pointer px-3 py-2">
        <WayLinks text={row.title} />
        <small className="caption block text-ink-muted tabular-nums">
          <WayLinks text={row.detail} />
        </small>
      </summary>
      {opened && (
        <pre className="code m-0 overflow-x-auto px-3 pb-3">
          <WayLinks text={pretty(row.object)} />
        </pre>
      )}
    </details>
  );
}
