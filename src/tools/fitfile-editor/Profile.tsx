import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FitRecord } from "../../shared/fit";
import type { EditorPoint } from "../../shared/fitDraft";
import { glyphOf, typeLabel } from "./types";

const HEIGHT = 150;
const PAD = { top: 14, right: 12, bottom: 22, left: 48 };
// the profile is drawn from at most this many points
const MAX_POINTS = 1500;

type Props = {
  records: FitRecord[];
  altitudes: number[];
  /** The other source's altitudes, drawn faintly for comparison. */
  other: { label: string; altitudes: number[] } | null;
  label: string;
  points: EditorPoint[];
  hovered: number | null;
  onHover: (distance: number | null) => void;
  onSelect: (id: string) => void;
};

function niceTicks(min: number, max: number, count: number) {
  const span = max - min || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step)
    out.push(v);
  return out;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth) setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry!.contentRect.width || 800),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Elevation against distance, with the course points along it. */
export function Profile({
  records,
  altitudes,
  other,
  label,
  points,
  hovered,
  onHover,
  onSelect,
}: Props) {
  const [ref, width] = useWidth();
  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const total = records.at(-1)?.distance || 1;

  const { yMin, yMax, yTicks, xTicks } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const list of [altitudes, other?.altitudes ?? []])
      for (const h of list) {
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    const pad = Math.max(5, (hi - lo) * 0.1);
    const yTicks = niceTicks(lo - pad, hi + pad, 3);
    return {
      yMin: Math.min(lo - pad, yTicks[0] ?? lo),
      yMax: Math.max(hi + pad, yTicks.at(-1) ?? hi),
      yTicks,
      xTicks: niceTicks(0, total / 1000, 6),
    };
  }, [altitudes, other, total]);

  const x = (d: number) => PAD.left + (d / total) * plotW;
  const y = (h: number) => PAD.top + (1 - (h - yMin) / (yMax - yMin)) * plotH;

  const path = (list: number[]) => {
    const step = Math.max(1, Math.ceil(records.length / MAX_POINTS));
    let d = "";
    for (let i = 0; i < records.length; i += step)
      d += `${d ? "L" : "M"}${x(records[i]!.distance).toFixed(1)},${y(list[i]!).toFixed(1)}`;
    const last = records.length - 1;
    if (last % step) d += `L${x(records[last]!.distance)},${y(list[last]!)}`;
    return d;
  };
  const main = useMemo(
    () => path(altitudes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [altitudes, records, plotW, yMin, yMax],
  );
  const faint = useMemo(
    () => (other ? path(other.altitudes) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [other, records, plotW, yMin, yMax],
  );

  const indexAt = (distance: number) => {
    let lo = 0;
    let hi = records.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (records[mid]!.distance < distance) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const hoverIdx = hovered === null ? 0 : indexAt(hovered);
  const hoverRecord = hovered === null ? undefined : records[hoverIdx];

  return (
    <div ref={ref} className="relative border-t border-line bg-surface">
      <div className="caption flex items-center gap-4 px-3 pt-2 text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-green" /> {label}
        </span>
        {other && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-ink-subtle" />{" "}
            {other.label}
          </span>
        )}
      </div>
      <svg
        width={width}
        height={HEIGHT}
        className="block"
        role="img"
        aria-label={`Elevation profile from ${label}`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left - PAD.left;
          if (px < 0 || px > plotW) return onHover(null);
          onHover((px / plotW) * total);
        }}
        onMouseLeave={() => onHover(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-line"
            />
            <text
              x={PAD.left - 6}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-ink-muted font-mono text-[11px]"
            >
              {Math.round(tick)} m
            </text>
          </g>
        ))}
        {xTicks.map((km) => (
          <text
            key={km}
            x={x(km * 1000)}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="fill-ink-muted font-mono text-[11px]"
          >
            {+km.toFixed(1)} km
          </text>
        ))}
        {faint && (
          <path
            d={faint}
            fill="none"
            strokeWidth={1.5}
            className="stroke-ink-subtle"
          />
        )}
        <path d={main} fill="none" strokeWidth={2} className="stroke-green" />
        {points.map((p) => (
          <g
            key={p.id}
            className="cursor-pointer"
            onClick={() => onSelect(p.id)}
          >
            <title>{`${typeLabel(p.type)} ${p.name}`.trim()}</title>
            <line
              x1={x(p.distance)}
              x2={x(p.distance)}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH - 6}
              className="stroke-ink-muted"
              strokeWidth={1.5}
            />
            {/* a hit target wider than the tick */}
            <rect
              x={x(p.distance) - 4}
              y={PAD.top + plotH - 10}
              width={8}
              height={10}
              fill="transparent"
            />
          </g>
        ))}
        {hoverRecord && (
          <g className="pointer-events-none">
            <line
              x1={x(hoverRecord.distance)}
              x2={x(hoverRecord.distance)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="stroke-ink"
            />
            <circle
              cx={x(hoverRecord.distance)}
              cy={y(altitudes[hoverIdx]!)}
              r={4}
              strokeWidth={2}
              className="fill-green stroke-surface"
            />
          </g>
        )}
      </svg>
      {hoverRecord && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-8 z-10 rounded-md border border-line bg-surface-raised px-2 py-1 font-mono text-[12px] whitespace-nowrap shadow-float tabular-nums"
          style={
            x(hoverRecord.distance) < width / 2
              ? { left: x(hoverRecord.distance) + 10 }
              : { right: width - x(hoverRecord.distance) + 10 }
          }
        >
          <b>{(hoverRecord.distance / 1000).toFixed(2)} km</b>
          <div>
            {label}: {altitudes[hoverIdx]!.toFixed(1)} m
          </div>
          {other && (
            <div className="text-ink-muted">
              {other.label}: {other.altitudes[hoverIdx]!.toFixed(1)} m
            </div>
          )}
          {points
            .filter(
              (p) =>
                Math.abs(p.distance - hoverRecord.distance) <
                (total / plotW) * 4,
            )
            .map((p) => (
              <div key={p.id} className="text-ink-muted">
                {glyphOf(p.type)} {typeLabel(p.type)} {p.name}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
