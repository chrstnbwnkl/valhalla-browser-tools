import { useState } from "react";
import { Button } from "../../shared/ui/Button";
import { KINDS, type Kind, type Suggestion } from "./suggestions";
import { glyphOf, typeLabel } from "./types";

type Props = {
  suggestions: Suggestion[];
  /** What the suggestions are still waiting for, e.g. the edges. */
  pending: string[];
  onAccept: (ids: string[]) => void;
  onDismiss: (ids: string[]) => void;
  onHover: (id: string | null) => void;
  onFocus: (s: Suggestion) => void;
};

export function SuggestionList({
  suggestions,
  pending,
  onAccept,
  onDismiss,
  onHover,
  onFocus,
}: Props) {
  const [open, setOpen] = useState<Kind | null>(null);
  const groups = (Object.keys(KINDS) as Kind[])
    .map((kind) => ({
      kind,
      items: suggestions.filter((s) => s.kind === kind),
    }))
    .filter((g) => g.items.length);

  return (
    <div className="mx-3 grid gap-2">
      {pending.map((text) => (
        <p key={text} className="m-0 text-ink-muted">
          {text}
        </p>
      ))}
      {!groups.length && !pending.length && (
        <p className="m-0 text-ink-muted">Nothing more to suggest.</p>
      )}
      {groups.map(({ kind, items }) => {
        const ids = items.map((s) => s.id);
        return (
          <section
            key={kind}
            aria-label={KINDS[kind]}
            className="rounded-lg border border-line bg-surface-raised"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                className="flex-1 cursor-pointer text-left font-bold"
                aria-expanded={open === kind}
                onClick={() => setOpen(open === kind ? null : kind)}
              >
                {open === kind ? "▾" : "▸"} {KINDS[kind]}{" "}
                <span className="text-ink-muted">{items.length}</span>
              </button>
              <Button size="sm" onClick={() => onAccept(ids)}>
                {kind === "turn-alert" ? "Move all" : "Add all"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDismiss(ids)}>
                Dismiss
              </Button>
            </div>
            {open === kind && (
              <ul className="m-0 list-none border-t border-line p-0">
                {items.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-1"
                    onMouseEnter={() => onHover(s.id)}
                    onMouseLeave={() => onHover(null)}
                  >
                    <button
                      type="button"
                      className="flex flex-1 cursor-pointer items-center gap-2 text-left"
                      title="Show on the map"
                      onClick={() => onFocus(s)}
                    >
                      <span aria-hidden className="w-5 text-center font-bold">
                        {glyphOf(s.point.type)}
                      </span>
                      <span className="flex-1">
                        {s.detail}
                        <span className="text-ink-muted">
                          {" "}
                          · {typeLabel(s.point.type)} ·{" "}
                          {(s.point.distance / 1000).toFixed(2)} km
                        </span>
                      </span>
                    </button>
                    <Button
                      size="sm"
                      aria-label={`Accept ${s.detail}`}
                      onClick={() => onAccept([s.id])}
                    >
                      {s.replaces ? "Move" : "Add"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Dismiss ${s.detail}`}
                      onClick={() => onDismiss([s.id])}
                    >
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
