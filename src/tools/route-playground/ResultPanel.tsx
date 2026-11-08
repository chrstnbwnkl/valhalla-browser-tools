import type { Position } from "geojson";
import { useMemo, useRef, useState } from "react";
import { encodeCourse } from "../../shared/fit";
import { Button } from "../../shared/ui/Button";
import { CopyButton } from "../../shared/ui/CopyButton";
import { Select } from "../../shared/ui/Input";
import { Stat, Stats } from "../../shared/ui/Stats";
import { pretty } from "../../shared/valhalla/request";
import type { Filters } from "./api";
import { EdgeList } from "./EdgeList";
import type { TracedLeg } from "./edges";
import { fmt } from "../../shared/format";
import type { RouteResult } from "./api";
import type { FlatStep, Route } from "../../shared/valhalla/osrm";
import {
  buildCourse,
  courseName,
  download,
  fitFilename,
} from "../../shared/course";
import { EDITOR_PATH, createDraft, storeDraft } from "../../shared/fitDraft";
import { Menu } from "../../shared/ui/Menu";
import type { Json } from "../../shared/valhalla/request";
import { StepList } from "./StepList";
import { ThemeControls } from "./ThemeControls";
import type { ThemeSettings, themeEdges } from "./themes";

export type View = "steps" | "edges";

type Props = {
  result: RouteResult;
  /** Where elevation for the FIT export comes from. */
  server: string;
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
  server,
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
              "The steps of the route with their costs and turn costs",
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
              Route {i} · cost {fmt(r.weight)}
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
              label={`cost (${route.weight_name ?? "?"})`}
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

      <FitExport
        server={server}
        route={route}
        costing={
          typeof result.sent.costing === "string" ? result.sent.costing : ""
        }
        start={result.data.waypoints?.[0]?.location}
        sent={result.sent}
      />

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

function FitExport({
  server,
  route,
  costing,
  start,
  sent,
}: {
  server: string;
  route: Route;
  costing: string;
  start?: Position;
  sent: Json;
}) {
  const [busy, setBusy] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  async function exportFit() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setNote("Requesting heights…");
    try {
      const { course, missing } = await buildCourse(server, route, costing, {
        start,
        signal: controller.signal,
      });
      download(encodeCourse(course), fitFilename(courseName(route, costing)));
      const points = `${course.coursePoints.length} course points`;
      setNote(
        missing
          ? `${points}, no elevation: ${missing}`
          : `${points}, ↑${Math.round(course.ascent ?? 0)} m ↓${Math.round(course.descent ?? 0)} m`,
      );
    } catch (e) {
      if (!controller.signal.aborted) setNote((e as Error).message);
    } finally {
      if (pending.current === controller) setBusy(false);
    }
  }

  function openEditor() {
    const draft = createDraft({ server, costing, sent, route, start });
    if (!storeDraft(draft))
      return setNote("The route is too large to hand to the editor.");
    window.open(EDITOR_PATH, "_blank");
  }

  return (
    <div className="m-3 flex flex-wrap items-center gap-2 text-ink-muted">
      Export
      <span className="inline-flex">
        <Button
          size="sm"
          className="rounded-r-none"
          disabled={busy}
          title="A Garmin FIT course of this route: elevation from /height, a course point for every maneuver and for the start and end of every leg, times from the step durations"
          onClick={() => void exportFit()}
        >
          FIT course
        </Button>
        <Button
          size="sm"
          className="-ml-px rounded-l-none px-1.5"
          aria-label="More FIT course options"
          aria-haspopup="menu"
          aria-expanded={menuAt !== null}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuAt({ x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </span>
      {note && <span className="text-[13px]">{note}</span>}
      {menuAt && (
        <Menu
          at={menuAt}
          title="FIT course"
          items={[{ label: "Open in fitfile editor", action: openEditor }]}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}

export const unitOf = (legs: TracedLeg[]) =>
  ({ kilometers: " km", miles: " mi" })[legs[0]?.path.units ?? ""] ?? "";

export function EdgeStats({ legs }: { legs: TracedLeg[] }) {
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
