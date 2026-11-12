import type { Position } from "geojson";
import { useMemo } from "react";
import { fmt, fmtValue } from "../../shared/format";
import { Badge } from "../../shared/ui/Badge";
import { CopyButton } from "../../shared/ui/CopyButton";
import { Select } from "../../shared/ui/Input";
import { Stat, Stats } from "../../shared/ui/Stats";
import type { FlatStep, Route } from "../../shared/valhalla/osrm";
import { isObject, pretty, type Json } from "../../shared/valhalla/request";
import type { RouteResult } from "../route-playground/api";
import { FitExport } from "../route-playground/ResultPanel";
import { StepList } from "../route-playground/StepList";
import { distance, orderIn, type Seed, type SeedCandidate } from "./request";
import { groupColor } from "./SeedMarkers";
import { useThemeColors } from "../../shared/theme/colors";

type Props = {
  result: RouteResult;
  server: string;
  routeIdx: number;
  onRouteIdx: (idx: number) => void;
  steps: FlatStep[];
  seeds: Seed[];
  debug: { samples: Seed[]; candidates: SeedCandidate[] };
  highlighted: number | null;
  onHover: (idx: number | null) => void;
  onFocus: (coords: Position[]) => void;
};

/** How far off the distance asked for, in percent. */
export function deviation(route: Route, sent: RouteResult["sent"]) {
  const options = isObject(sent.round_trip_options)
    ? sent.round_trip_options
    : {};
  const target = options.distance;
  if (typeof target !== "number" || target <= 0) return null;
  if (typeof route.distance !== "number") return null;
  return ((route.distance - target) / target) * 100;
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function DeviationBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const off = Math.abs(value);
  return (
    <Badge tone={off <= 10 ? "green" : off <= 25 ? "amber" : "danger"}>
      {signed(value)} % of target
    </Badge>
  );
}

export function ResultPanel({
  result,
  server,
  routeIdx,
  onRouteIdx,
  steps,
  seeds,
  debug,
  highlighted,
  onHover,
  onFocus,
}: Props) {
  const { routes } = result.data;
  const route = routes[routeIdx]!;
  const response = useMemo(() => pretty(result.data), [result.data]);
  const raw = (result.data as unknown as Json).warnings;
  const warnings = Array.isArray(raw) ? raw.filter(isObject) : [];
  const off = deviation(route, result.sent);

  return (
    <div>
      {warnings.length > 0 && (
        <ul
          aria-label="Warnings"
          className="mx-3 mt-3 mb-0 grid list-none gap-1 rounded-lg bg-amber-soft px-3 py-2 text-amber-ink"
        >
          {warnings.map((w, i) => (
            <li key={i}>
              <b className="font-mono">{fmtValue(w.code)}</b> {fmtValue(w.text)}
            </li>
          ))}
        </ul>
      )}
      {routes.length > 1 && (
        <Select
          aria-label="Round trip"
          className="mx-3 mt-3 block w-[calc(100%-24px)]"
          value={routeIdx}
          onChange={(e) => onRouteIdx(Number(e.target.value))}
        >
          {routes.map((r, i) => {
            const d = deviation(r, result.sent);
            return (
              <option key={i} value={i}>
                Round trip {i} · {fmt(r.distance, " m")}
                {d === null ? "" : ` (${signed(d)} %)`} · cost {fmt(r.weight)}
              </option>
            );
          })}
        </Select>
      )}

      <Stats className="mx-3 mt-3">
        <Stat label="distance" value={fmt(route.distance)} unit="m" />
        <Stat label="duration" value={fmt(route.duration)} unit="s" />
        <Stat
          label={`cost (${route.weight_name ?? "?"})`}
          value={fmt(route.weight)}
        />
      </Stats>
      <div className="mx-3 mt-2">
        <DeviationBadge value={off} />
      </div>

      <SeedList
        seeds={seeds}
        samples={debug.samples}
        candidates={debug.candidates}
        verbose={result.sent.verbose === true}
      />

      <div className="m-3 flex flex-wrap items-center gap-2 text-ink-muted">
        Copy
        <CopyButton size="sm" title="The round_trip response" text={response}>
          response
        </CopyButton>
      </div>

      <FitExport
        server={server}
        route={route}
        costing={
          typeof result.sent.costing === "string" ? result.sent.costing : ""
        }
        start={result.data.waypoints?.[0]?.location}
        sent={result.sent}
      />

      <StepList
        route={route}
        steps={steps}
        highlighted={highlighted}
        onHover={onHover}
        onFocus={onFocus}
      />
    </div>
  );
}

const lonLat = (p: Position) => p.map((c) => c.toFixed(6)).join(",");

/**
 * The seeds of the round trip on show; with a debug response, every candidate,
 * numbered where the round trip passes it.
 */
function SeedList({
  seeds,
  samples,
  candidates,
  verbose,
}: {
  seeds: Seed[];
  samples: Seed[];
  candidates: SeedCandidate[];
  verbose: boolean;
}) {
  const colors = useThemeColors();
  if (!seeds.length && !candidates.length)
    return verbose ? null : (
      <p className="mx-3 mt-3 mb-0 text-ink-muted">
        Send with verbose to see the seeds the round trip passes through.
      </p>
    );

  const rows: (SeedCandidate & { order: number | null })[] = candidates.length
    ? candidates.map((c, i) => ({
        ...c,
        order: orderIn(candidates, seeds)[i]!,
      }))
    : seeds.map((s, i) => ({ ...s, snapped: null, order: i + 1 }));
  const counts = [
    samples.length > 0 && `${samples.length} sampled`,
    candidates.length > 0 && `${candidates.length} candidates`,
    `${seeds.length} used`,
  ].filter(Boolean);

  return (
    <div className="mx-3 mt-3">
      <div className="label text-ink-muted">Seeds · {counts.join(" · ")}</div>
      <ol
        aria-label="Seeds"
        className="mt-1 mb-0 grid list-none gap-1 p-0 font-mono tabular-nums"
      >
        {rows.map((row, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 ${row.order === null ? "text-ink-muted" : ""}`}
            title={
              row.snapped ? `snapped to ${lonLat(row.snapped)}` : undefined
            }
          >
            <span
              className={`size-3 flex-none border-3 ${row.order === null ? "rounded-full" : "rounded-sm"}`}
              style={{ borderColor: groupColor(colors, row.group) }}
            />
            <b className="w-4">{row.order ?? "–"}</b>
            <span className="text-ink-muted">group {row.group}</span>
            {row.snapped && (
              <span className="text-ink-muted">
                snap {Math.round(distance(row.location, row.snapped))} m
              </span>
            )}
            <span className="ml-auto">{lonLat(row.location)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
