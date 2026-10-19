import { Badge } from "../shared/ui/Badge";
import { Stat, Stats } from "../shared/ui/Stats";
import { Markdown } from "./Markdown";

/** What scripts/option-of-the-day.py writes. */
export type Option = {
  id: string;
  name: string;
  /** e.g. "costing option · pedestrian, bikeshare" */
  scope: string;
  type?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  description: string;
  badge: string | null;
  /** What changed in Valhalla. */
  notes: string[];
};

const show = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value);

export function OptionOfTheDay({ option }: { option: Option }) {
  const [kind, costings] = option.scope.split(" · ");
  return (
    <section
      aria-labelledby="option-of-the-day"
      className="mt-12 grid gap-3 rounded-lg border border-line bg-surface-raised p-6"
    >
      <h2 id="option-of-the-day" className="heading m-0 mb-1">
        Option of the Day
      </h2>
      <div className="flex flex-wrap items-center gap-3 wrap-anywhere">
        <code className="stat rounded-md bg-ink px-3 py-1 text-surface">
          {option.name}
        </code>
        {option.badge && <Badge tone="magenta">{option.badge}</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-ink-muted">
        <Badge>{kind}</Badge>
        {costings && <span className="caption">for {costings}</span>}
      </div>
      {option.notes.length > 0 && (
        <div
          role="note"
          className="grid gap-1 rounded-md bg-blue-soft px-4 py-3 text-[15px]/6"
        >
          {option.notes.map((note) => (
            <p key={note} className="m-0">
              {note}
            </p>
          ))}
        </div>
      )}
      <p className="body m-0">
        {option.description ? (
          <Markdown text={option.description} />
        ) : (
          "No description."
        )}
      </p>
      {/* type and default always, as "no default" says something too */}
      <Stats>
        <Stat label="type" value={option.type ?? "–"} />
        <Stat
          label="default"
          value={"default" in option ? show(option.default) : "–"}
        />
        {option.minimum !== undefined && (
          <Stat label="min" value={show(option.minimum)} />
        )}
        {option.maximum !== undefined && (
          <Stat label="max" value={show(option.maximum)} />
        )}
      </Stats>
      {option.enum && (
        <div className="flex flex-wrap items-center gap-2 text-ink-muted">
          <small className="caption">one of</small>
          {option.enum.map((value) => (
            <span
              key={show(value)}
              className="rounded-sm border border-line bg-surface-sunken px-2 py-0.5 font-mono text-[13px]/[18px] text-ink"
            >
              {show(value)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
