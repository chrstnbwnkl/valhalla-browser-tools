import { useMemo, useState } from "react";
import { cn } from "../../shared/cn";
import { fmt } from "../../shared/format";
import { Button } from "../../shared/ui/Button";
import { Select } from "../../shared/ui/Input";
import { Stat, Stats } from "../../shared/ui/Stats";
import type { RouteEdge } from "../route-playground/edges";
import { histogram, numericKeys, type Bin, type Histogram } from "./histogram";

// the chart's coordinate space; it scales with the sidebar
const WIDTH = 372;
const HEIGHT = 150;
const PAD = { top: 18, right: 8, bottom: 22, left: 44 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const MAX_BAR = 24;
const GAP = 2;
const MAX_X_LABELS = 7;

type Props = {
  edges: RouteEdge[];
  /** The attributes chosen to plot, some of which these edges may not have. */
  keys: string[];
  onKeys: (keys: string[]) => void;
  /** The unit of the edge lengths, e.g. "km". */
  unit: string;
  /** The edges of the bin under the pointer, to show on the map. */
  onHover: (edges: number[] | null) => void;
};

export function Histograms({ edges, keys, onKeys, unit, onHover }: Props) {
  const available = useMemo(() => numericKeys(edges), [edges]);
  const shown = keys.filter((key) => available.includes(key));
  const addable = available.filter((key) => !shown.includes(key));

  return (
    <div className="mx-3 mb-3 grid gap-3">
      <Select
        aria-label="Add a histogram"
        value=""
        disabled={!addable.length}
        onChange={(e) => onKeys([...shown, e.target.value])}
      >
        <option value="" disabled>
          {addable.length
            ? "Add a histogram of…"
            : "No other numeric attributes"}
        </option>
        {addable.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </Select>
      {!shown.length && (
        <p className="m-0 text-ink-muted">
          Pick a numeric edge attribute, e.g. density or speed, to see how much
          of the route&apos;s distance has which value.
        </p>
      )}
      {shown.map((key) => (
        <HistogramCard
          key={key}
          name={key}
          histogram={histogram(edges, key, unit === "mi" ? "miles" : undefined)}
          unit={unit}
          onHover={onHover}
          onRemove={() => onKeys(shown.filter((k) => k !== key))}
        />
      ))}
    </div>
  );
}

function HistogramCard({
  name,
  histogram,
  unit,
  onHover,
  onRemove,
}: {
  name: string;
  histogram: Histogram | null;
  unit: string;
  onHover: (edges: number[] | null) => void;
  onRemove: () => void;
}) {
  return (
    <section
      aria-label={`Histogram of ${name}`}
      className="rounded-lg border border-line bg-surface-raised p-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="code m-0 flex-1 font-bold">{name}</h3>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Remove the histogram of ${name}`}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
      {histogram && (
        <>
          <Stats className="mt-2 gap-4 border-0 bg-transparent p-0">
            <Stat label="distance-weighted mean" value={fmt(histogram.mean)} />
            <Stat
              label="range"
              value={`${fmt(histogram.min)} – ${fmt(histogram.max)}`}
            />
            <Stat
              label="with a value"
              value={fmt(histogram.distance)}
              unit={unit}
            />
            {histogram.missing > 0 && (
              <Stat
                label="without"
                value={fmt(histogram.missing)}
                unit={unit}
              />
            )}
          </Stats>
          <Chart histogram={histogram} unit={unit} onHover={onHover} />
          <details className="mt-1">
            <summary className="cursor-pointer text-ink-muted">Table</summary>
            <table className="mt-1 w-full font-mono tabular-nums">
              <thead className="text-left text-ink-muted">
                <tr>
                  <th className="font-medium">{name}</th>
                  <th className="text-right font-medium">distance</th>
                  <th className="text-right font-medium">share</th>
                  <th className="text-right font-medium">edges</th>
                </tr>
              </thead>
              <tbody>
                {histogram.bins
                  .filter((bin) => bin.edges.length)
                  .map((bin) => (
                    <tr key={bin.from}>
                      <td>{binLabel(bin, histogram)}</td>
                      <td className="text-right">
                        {fmt(bin.distance, ` ${unit}`)}
                      </td>
                      <td className="text-right">{share(bin, histogram)}</td>
                      <td className="text-right">{bin.edges.length}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

const binLabel = (bin: Bin, { discrete, bins }: Histogram) =>
  discrete
    ? fmt(bin.from)
    : `${fmt(bin.from)} to ${bin === bins.at(-1) ? "" : "<"}${fmt(bin.to)}`;

const share = (bin: Bin, { distance }: Histogram) =>
  distance ? `${Math.round((bin.distance / distance) * 100)}%` : "–";

/** Up to `count` round ticks from 0 past `max`. */
function ticks(max: number, count = 3) {
  if (max <= 0) return [0];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  return Array.from(
    { length: Math.ceil(max / step - 1e-9) + 1 },
    (_, i) => i * step,
  );
}

function Chart({
  histogram,
  unit,
  onHover,
}: {
  histogram: Histogram;
  unit: string;
  onHover: (edges: number[] | null) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const { bins, discrete, mean } = histogram;
  const yTicks = ticks(Math.max(...bins.map((b) => b.distance)));
  const top = yTicks.at(-1) || 1;
  const band = PLOT_W / bins.length;
  const barW = Math.max(1, Math.min(MAX_BAR, band - GAP));
  const y = (distance: number) => PAD.top + PLOT_H * (1 - distance / top);
  const bandX = (i: number) => PAD.left + i * band;
  // a value's place along the x axis, in bands
  const at = (value: number) =>
    discrete
      ? value - bins[0]!.from + 0.5
      : (value - bins[0]!.from) / (bins[0]!.to - bins[0]!.from);
  const every = Math.ceil(bins.length / MAX_X_LABELS);

  const hover = (i: number | null) => {
    setActive(i);
    onHover(i === null ? null : bins[i]!.edges);
  };
  const shown = active === null ? null : bins[active]!;

  return (
    <div className="relative mt-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full overflow-visible"
        role="img"
        aria-label={`Distance by value, with a mean of ${fmt(mean)}`}
        onMouseLeave={() => hover(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-line"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-ink-muted font-mono text-[11px]"
            >
              {fmt(tick)}
            </text>
          </g>
        ))}
        <text
          x={PAD.left - 6}
          y={PAD.top - 8}
          textAnchor="end"
          className="fill-ink-muted font-mono text-[11px]"
        >
          {unit}
        </text>

        {bins.map((bin, i) => {
          const h = PLOT_H * (bin.distance / top);
          const x = bandX(i) + (band - barW) / 2;
          const r = Math.min(4, barW / 2, h);
          const base = PAD.top + PLOT_H;
          return (
            <g key={bin.from}>
              {h > 0 && (
                <path
                  d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`}
                  className={cn(
                    "fill-green transition-opacity",
                    active !== null && active !== i && "opacity-40",
                  )}
                />
              )}
              {/* the whole band answers the pointer, not just the bar */}
              <rect
                data-testid="bin"
                x={bandX(i)}
                y={PAD.top}
                width={band}
                height={PLOT_H}
                fill="transparent"
                onMouseEnter={() => hover(i)}
              />
            </g>
          );
        })}

        {bins.map(
          (bin, i) =>
            i % every === 0 && (
              <text
                key={bin.from}
                x={bandX(i) + (discrete ? band / 2 : 0)}
                y={HEIGHT - 6}
                textAnchor="middle"
                className="fill-ink-muted font-mono text-[11px]"
              >
                {fmt(bin.from)}
              </text>
            ),
        )}
        {!discrete && (bins.length - 1) % every !== 0 && (
          <text
            x={WIDTH - PAD.right}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-ink-muted font-mono text-[11px]"
          >
            {fmt(bins.at(-1)!.to)}
          </text>
        )}

        <line
          x1={PAD.left + at(mean) * band}
          x2={PAD.left + at(mean) * band}
          y1={PAD.top - 4}
          y2={PAD.top + PLOT_H}
          className="pointer-events-none stroke-ink"
          strokeWidth={1.5}
        />
        <text
          x={PAD.left + at(mean) * band}
          y={PAD.top - 7}
          textAnchor={at(mean) > bins.length / 2 ? "end" : "start"}
          className="pointer-events-none fill-ink font-mono text-[11px]"
        >
          mean {fmt(mean)}
        </text>
      </svg>
      {shown && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-surface-raised px-2 py-1 font-mono whitespace-nowrap shadow-float tabular-nums"
          style={
            active! < bins.length / 2
              ? { left: `${((bandX(active! + 1) + 4) / WIDTH) * 100}%` }
              : { right: `${((WIDTH - bandX(active!) + 4) / WIDTH) * 100}%` }
          }
        >
          <b>{binLabel(shown, histogram)}</b>
          <div className="text-ink-muted">
            {fmt(shown.distance, ` ${unit}`)} · {share(shown, histogram)} ·{" "}
            {shown.edges.length} {shown.edges.length === 1 ? "edge" : "edges"}
          </div>
        </div>
      )}
    </div>
  );
}
