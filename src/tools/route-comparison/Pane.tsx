import type { Position } from "geojson";
import type { MapMouseEvent } from "maplibre-gl";
import { useEffect, useState } from "react";
import { Input } from "../../shared/ui/Input";
import { fmt } from "../../shared/format";
import { MapProvider, useLoadedMap } from "../../shared/map/context";
import { fitTo } from "../../shared/map/fit";
import { InspectPopup } from "../../shared/map/InspectPopup";
import { MapEvents } from "../../shared/map/MapEvents";
import { MapView } from "../../shared/map/MapView";
import type { MapSync } from "../../shared/map/sync";
import { useThemeColors } from "../../shared/theme/colors";
import { Badge } from "../../shared/ui/Badge";
import { Select } from "../../shared/ui/Input";
import { Stat, Stats } from "../../shared/ui/Stats";
import type { Json } from "../../shared/valhalla/request";
import type { Response } from "./response";
import { RouteLayers } from "./RouteLayers";

type Props = {
  name: string;
  response: Response;
  /** Every pane's route, which a new pane shows for all of them. */
  everything: Position[];
  colour: boolean;
  sync: MapSync;
  onRename: (name: string) => void;
  onClose: () => void;
};

type Inspected = { title: string; object: Json; at: Position };

// a new pane leads with its view of every route
function Synced({ sync }: { sync: MapSync }) {
  const map = useLoadedMap();
  useEffect(() => sync.add(map, true), [map, sync]);
  return null;
}

/** A response on a map of its own, whose view follows the other panes. */
export function Pane(props: Props) {
  return (
    <MapProvider>
      <PaneMap {...props} />
    </MapProvider>
  );
}

function PaneMap({
  name,
  response,
  everything,
  colour,
  sync,
  onRename,
  onClose,
}: Props) {
  const colors = useThemeColors();
  const [routeIdx, setRouteIdx] = useState(0);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const route = response.routes[routeIdx]!;

  function onClick(e: MapMouseEvent) {
    if (
      (e.originalEvent.target as Element | null)?.closest?.(
        ".maplibregl-marker",
      )
    )
      return;
    // with a popup open, a click only closes it
    if (inspected) return setInspected(null);
    const [feature] = e.target.queryRenderedFeatures(e.point, {
      layers: ["intersections", "segments"].filter((id) =>
        e.target.getLayer(id),
      ),
    });
    if (!feature) return;
    const { idx = -1, i = -1 } = feature.properties as {
      idx?: number;
      i?: number;
    };
    const segment = route.segments[idx];
    if (!segment) return;
    if (feature.layer.id === "intersections") {
      const intersection = segment.intersections[i];
      if (intersection)
        setInspected({
          title: `step ${idx} · intersection ${i}`,
          object: intersection.raw,
          at: intersection.at,
        });
      return;
    }
    setInspected({
      title: `${response.format === "osrm" ? "step" : "maneuver"} ${idx}`,
      object: segment.raw,
      at: [e.lngLat.lng, e.lngLat.lat],
    });
  }

  return (
    <div className="relative size-full">
      <MapView
        className="size-full"
        colour={colour}
        // the page has the controls, once for all panes
        options={{
          center: [10, 50],
          zoom: 3,
          dragRotate: false,
          attributionControl: false,
        }}
        onLoad={(map) => fitTo(map, everything, { padding: 60, duration: 0 })}
      >
        <Synced sync={sync} />
        <MapEvents onClick={onClick} />
        <RouteLayers
          response={response}
          routeIdx={routeIdx}
          highlighted={highlighted}
          colors={colors}
          onHover={setHighlighted}
          onInspect={(title, object, at) => setInspected({ title, object, at })}
        />
        {inspected && (
          <InspectPopup
            title={inspected.title}
            object={inspected.object}
            position={inspected.at}
            onClose={() => setInspected(null)}
          />
        )}
      </MapView>

      <section
        aria-label={name}
        className="caption absolute top-3 left-3 z-[3] grid max-w-[calc(100%-5rem)] gap-2 rounded-lg bg-surface-raised p-3 shadow-float"
      >
        <div className="flex items-center gap-2">
          <Name name={name} onRename={onRename} />
          <Badge>{response.format}</Badge>
        </div>
        {response.routes.length > 1 && (
          <Select
            aria-label="Route"
            value={routeIdx}
            onChange={(e) => {
              setRouteIdx(Number(e.target.value));
              setHighlighted(null);
              setInspected(null);
            }}
          >
            {response.routes.map((r, i) => (
              <option key={i} value={i}>
                {i ? `Alternative ${i}` : "Route"} · {fmt(r.cost)}
              </option>
            ))}
          </Select>
        )}
        <Stats className="gap-4 px-3 py-2">
          <Stat label={route.costName} value={fmt(route.cost)} />
          <Stat label="duration" value={fmt(route.duration)} unit="s" />
          <Stat
            label="distance"
            value={fmt(route.distance)}
            unit={route.distanceUnit}
          />
        </Stats>
      </section>
      <button
        type="button"
        aria-label={`Close ${name}`}
        title="Close"
        className="absolute top-3 right-3 z-[3] grid size-9 cursor-pointer place-items-center rounded-full bg-surface-raised text-[20px] text-ink-muted shadow-float hover:text-ink"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}

/** The pane's label, edited in place. */
function Name({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button
        type="button"
        className="label cursor-text truncate rounded-sm text-left hover:bg-surface-sunken"
        title="Click to rename"
        onClick={() => setEditing(true)}
      >
        {name}
      </button>
    );
  return (
    <Input
      autoFocus
      aria-label="Label"
      className="h-7 min-w-0 px-2"
      defaultValue={name}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        onRename(e.target.value.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
