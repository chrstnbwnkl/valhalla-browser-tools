import type { Position } from "geojson";
import { useMemo } from "react";
import { Button } from "../../shared/ui/Button";
import { CopyButton } from "../../shared/ui/CopyButton";
import { Select } from "../../shared/ui/Input";
import { Stat, Stats } from "../../shared/ui/Stats";
import { pretty } from "../../shared/valhalla/request";
import type { Filters } from "./api";
import { EdgeList } from "./EdgeList";
import type { TracedLeg } from "./edges";
import { fmt } from "./format";
import type { FlatStep, RouteResult } from "./routes";
import { StepList } from "./StepList";
import { ThemeControls } from "./ThemeControls";
import type { ThemeSettings, themeEdges } from "./themes";

export type View = "steps" | "edges";

type Props = {
  result: RouteResult;
  routeIdx: number;
  onRouteIdx: (idx: number) => void;
  view: View;
  onView: (view: View) => void;
  filters: Filters | null;
  onOpenFilters: () => void;
  steps: FlatStep[];
  /** The edges view, once its edges are there. */
  edges: { themed: ReturnType<typeof themeEdges>; legs: TracedLeg[] } | null;
  themes: ThemeSettings;
  onThemes: (themes: ThemeSettings) => void;
  /** The trace_attributes request for the route on show. */
  traceRequest: string;
  highlighted: number | null;
  onHover: (idx: number | null) => void;
  onFocus: (coords: Position[]) => void;
};

export function ResultPanel({
  result,
  routeIdx,
  onRouteIdx,
  view,
  onView,
  filters,
  onOpenFilters,
  steps,
  edges,
  themes,
  onThemes,
  traceRequest,
  highlighted,
  onHover,
  onFocus,
}: Props) {
  const { routes } = result.data;
  const route = routes[routeIdx]!;
  const response = useMemo(() => pretty(result.data), [result.data]);
  // one response per leg, or just that one
  const traceResponse = useMemo(() => {
    const paths = edges?.legs.map((leg) => leg.path) ?? [];
    return pretty(paths.length > 1 ? paths : paths[0]);
  }, [edges?.legs]);

  return (
    <div>
      <div className="label mx-3 mt-3 flex items-center gap-4">
        {(
          [
            [
              "steps",
              "Maneuvers",
              "The steps of the route with their weights and turn weights",
            ],
            [
              "edges",
              "Edges",
              "The edges of the route with their attributes, from a trace_attributes request for the shape of each leg",
            ],
          ] as const
        ).map(([value, label, title]) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-1"
            title={title}
          >
            <input
              type="radio"
              name="view"
              className="m-0 accent-green"
              checked={view === value}
              onChange={() => onView(value)}
            />
            {label}
          </label>
        ))}
        <Button
          size="sm"
          className="ml-auto"
          title="Which attributes the trace_attributes requests ask for"
          onClick={onOpenFilters}
        >
          {filters
            ? `Attribute filter: ${filters.action} ${filters.attributes.length}…`
            : "Attribute filter…"}
        </Button>
      </div>
      {routes.length > 1 && (
        <Select
          aria-label="Route"
          className="mx-3 mt-3 block w-[calc(100%-24px)]"
          value={routeIdx}
          onChange={(e) => onRouteIdx(Number(e.target.value))}
        >
          {routes.map((r, i) => (
            <option key={i} value={i}>
              Route {i} · weight {fmt(r.weight)}
            </option>
          ))}
        </Select>
      )}

      <Stats className="mx-3 mt-3">
        {view === "edges" && edges ? (
          <EdgeStats legs={edges.legs} />
        ) : (
          <>
            <Stat
              label={`weight (${route.weight_name ?? "?"})`}
              value={fmt(route.weight)}
            />
            <Stat label="duration" value={fmt(route.duration)} unit="s" />
            <Stat label="distance" value={fmt(route.distance)} unit="m" />
          </>
        )}
      </Stats>

      <div className="m-3 flex flex-wrap items-center gap-2 text-ink-muted">
        Copy
        <CopyButton size="sm" title="The route response" text={response}>
          response
        </CopyButton>
        <CopyButton
          size="sm"
          title="A trace_attributes request that edge-walks the shape of this route"
          text={traceRequest}
        >
          trace_attributes
        </CopyButton>
        {view === "edges" && edges && (
          <CopyButton
            size="sm"
            title="The trace_attributes response the edges view shows; one per leg when the route has several"
            text={traceResponse}
          >
            trace_attributes response
          </CopyButton>
        )}
      </div>

      {view === "edges" && edges && (
        <ThemeControls
          settings={themes}
          onChange={onThemes}
          {...edges.themed}
        />
      )}
      {view === "steps" && (
        <StepList
          route={route}
          steps={steps}
          highlighted={highlighted}
          onHover={onHover}
          onFocus={onFocus}
        />
      )}
      {view === "edges" && edges && (
        <EdgeList
          edges={edges.themed.edges}
          legs={edges.legs}
          edgeTheme={edges.themed.edgeTheme}
          nodeTheme={edges.themed.nodeTheme}
          unit={unitOf(edges.legs)}
          highlighted={highlighted}
          onHover={onHover}
          onFocus={onFocus}
        />
      )}
    </div>
  );
}

const unitOf = (legs: TracedLeg[]) =>
  ({ kilometers: " km", miles: " mi" })[legs[0]?.path.units ?? ""] ?? "";

function EdgeStats({ legs }: { legs: TracedLeg[] }) {
  const edges = legs.flatMap((leg) => leg.path.edges);
  // elapsed_time starts over in every leg
  const elapsed = legs.map(
    ({ path }) =>
      path.edges.findLast(
        (edge) => typeof edge.end_node?.elapsed_time === "number",
      )?.end_node?.elapsed_time,
  );
  const hasLength = edges.some((edge) => typeof edge.length === "number");
  return (
    <>
      <Stat label="edges" value={String(edges.length)} />
      <Stat
        label="length"
        value={
          hasLength
            ? fmt(edges.reduce((sum, edge) => sum + (edge.length ?? 0), 0))
            : "–"
        }
        unit={unitOf(legs).trim()}
      />
      <Stat
        label="elapsed time"
        value={fmt(
          elapsed.every((time) => typeof time === "number")
            ? elapsed.reduce((sum, time) => sum + time, 0)
            : undefined,
        )}
        unit="s"
      />
    </>
  );
}
