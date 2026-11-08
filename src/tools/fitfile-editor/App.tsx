import type { LngLat, MapMouseEvent } from "maplibre-gl";
import { useMemo, useState } from "react";
import {
  climb,
  download,
  fitFilename,
  pointAt,
  routeTrack,
  snapToTrack,
} from "../../shared/course";
import {
  MAPTERHORN_ATTRIBUTION,
  MAPTERHORN_ATTRIBUTION_URL,
} from "../../shared/elevation/mapterhorn";
import { CoursePointType, encodeCourse, type Sport } from "../../shared/fit";
import {
  DRAFT_KEY,
  createDraft,
  newId,
  parseDraft,
  type Draft,
  type EditorPoint,
} from "../../shared/fitDraft";
import { useStoredState } from "../../shared/hooks/useStoredState";
import { useMap } from "../../shared/map/context";
import { Controls } from "../../shared/map/Controls";
import { fitTo } from "../../shared/map/fit";
import { MapEvents } from "../../shared/map/MapEvents";
import { MapView } from "../../shared/map/MapView";
import { useThemeColors } from "../../shared/theme/colors";
import { Button } from "../../shared/ui/Button";
import { CommitInput, Select } from "../../shared/ui/Input";
import { Menu, type MenuItem } from "../../shared/ui/Menu";
import { Stat, Stats } from "../../shared/ui/Stats";
import { Toggle } from "../../shared/ui/Toggle";
import { legShapes } from "../../shared/valhalla/osrm";
import { routeEdges } from "../route-playground/edges";
import { useTraces } from "../route-playground/useTraces";
import { CourseLayers } from "./CourseLayers";
import { PointList } from "./PointList";
import { Profile } from "./Profile";
import { flattenStructures, spansOf, TRACE_FILTERS } from "./spans";
import { SuggestionList } from "./SuggestionList";
import { suggest, type Suggestion } from "./suggestions";
import {
  SETTINGS_KEY,
  SPORT_OPTIONS,
  parseSettings,
  type Settings,
} from "./types";
import { useElevation } from "./useElevation";

type MenuState = {
  at: { x: number; y: number };
  title: string;
  items: MenuItem[];
};

const SOURCE_LABELS = {
  valhalla: "Valhalla /height",
  mapterhorn: "Mapterhorn",
};

export function App() {
  const [draft, setDraft] = useStoredState(DRAFT_KEY, parseDraft);
  if (!draft)
    return (
      <div className="grid h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="heading m-0">Fitfile editor</h1>
          <p className="m-0 mt-2 text-ink-muted">
            Nothing to edit. Open a route here from the export menu of the{" "}
            <a href="../route-playground/">route playground</a>.
          </p>
        </div>
      </div>
    );
  return <Editor draft={draft} onDraft={setDraft} />;
}

const byDistance = (points: EditorPoint[]) =>
  [...points].sort((a, b) => a.distance - b.distance);

function Editor({
  draft,
  onDraft,
}: {
  draft: Draft;
  onDraft: (draft: Draft) => void;
}) {
  const map = useMap();
  const colors = useThemeColors();
  const [settings, setSettings] = useStoredState(SETTINGS_KEY, parseSettings);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(
    null,
  );
  const [cursor, setCursor] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const { source, points } = draft;
  const { route, start, server } = source;

  const records = useMemo(
    () => routeTrack(route, start, settings.spacing).records,
    [route, start, settings.spacing],
  );

  const traceKey = useMemo(
    () => ({ sent: source.sent, filters: TRACE_FILTERS, routeIdx: 0 }),
    [source.sent],
  );
  const traces = useTraces(
    server,
    traceKey,
    useMemo(() => legShapes(route, start), [route, start]),
    true,
  );
  const spans = useMemo(
    () => (traces.legs ? spansOf(routeEdges(traces.legs), records) : null),
    [traces.legs, records],
  );

  const elevation = useElevation(
    server,
    records,
    settings.elevation,
    settings.zoom,
  );
  const fix = (heights: number[] | null) =>
    heights && settings.flatten && spans
      ? flattenStructures(records, heights, spans)
      : heights;
  const altitudes = useMemo(
    () => fix(elevation.heights),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elevation.heights, settings.flatten, spans, records],
  );
  const otherAltitudes = useMemo(
    () => fix(elevation.other),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elevation.other, settings.flatten, spans, records],
  );
  const totals = useMemo(() => altitudes && climb(altitudes), [altitudes]);

  const suggestions = useMemo(
    () =>
      suggest({
        points,
        records,
        altitudes,
        spans,
        settings,
        dismissed: draft.dismissed,
      }),
    [points, records, altitudes, spans, settings, draft.dismissed],
  );
  const pending = [
    traces.loading && "Requesting trace_attributes for the edges…",
    traces.error,
    elevation.loading && "Waiting for elevation for climbs and summits…",
  ].filter((text): text is string => !!text);

  const change = (next: Partial<Draft>) => onDraft({ ...draft, ...next });
  const setPoints = (next: EditorPoint[], dismissed = draft.dismissed) =>
    change({ points: byDistance(next), dismissed });
  const set = (patch: Partial<Settings>) =>
    setSettings({ ...settings, ...patch });

  const snapped = (at: LngLat) => {
    const p = snapToTrack(records, [at.lng, at.lat]);
    return p && { lon: p.lon, lat: p.lat, distance: p.distance };
  };

  function movePoint(id: string, at: LngLat) {
    const place = snapped(at);
    if (place)
      setPoints(points.map((p) => (p.id === id ? { ...p, ...place } : p)));
  }

  function addPoint(at: LngLat) {
    const place = snapped(at);
    if (!place) return;
    const point = {
      id: newId(),
      ...place,
      type: CoursePointType.Generic,
      name: "",
    };
    setPoints([...points, point]);
    setSelected(point.id);
  }

  function accept(ids: string[]) {
    let next = points;
    for (const s of suggestions.filter((s) => ids.includes(s.id))) {
      next = s.replaces
        ? next.map((p) => (p.id === s.replaces ? { ...p, ...s.point } : p))
        : [...next, { id: newId(), ...s.point }];
    }
    // a suggestion taken is done with, like one turned down
    setPoints(next, [...draft.dismissed, ...ids]);
  }

  const focus = (lon: number, lat: number) =>
    map && fitTo(map, [[lon, lat]], { padding: 120, maxZoom: 16 });

  function exportFit() {
    const withAltitude = records.map((r, i) =>
      altitudes ? { ...r, altitude: altitudes[i] } : r,
    );
    const bytes = encodeCourse({
      name: draft.name,
      sport: draft.sport,
      start: new Date(),
      records: withAltitude,
      coursePoints: points.map((p) => ({
        ...p,
        time: pointAt(records, p.distance)?.time ?? 0,
      })),
      ...(totals ?? {}),
    });
    download(bytes, fitFilename(draft.name));
  }

  function onContextMenu(e: MapMouseEvent) {
    setMenu({
      at: { x: e.originalEvent.clientX, y: e.originalEvent.clientY },
      title: "Course point",
      items: [
        {
          label: "Add course point here",
          action: () => addPoint(e.lngLat),
        },
      ],
    });
  }

  function openPointMenu(id: string, e: MouseEvent) {
    setMenu({
      at: { x: e.clientX, y: e.clientY },
      title: "Course point",
      items: [
        {
          label: "Delete",
          danger: true,
          action: () => setPoints(points.filter((p) => p.id !== id)),
        },
      ],
    });
  }

  const cursorAt = cursor === null ? null : pointAt(records, cursor);
  const shownError = elevation.error;

  return (
    <div className="flex h-screen">
      <aside className="caption flex w-[440px] flex-none flex-col overflow-y-auto border-r border-line bg-surface">
        <div className="grid gap-2 p-3">
          <h1 className="subheading m-0">Fitfile editor</h1>
          <label className="grid gap-1">
            <span className="label">Course name</span>
            <CommitInput
              value={draft.name}
              onCommit={(name) => change({ name })}
            />
          </label>
          <div className="flex items-end gap-2">
            <label className="grid flex-1 gap-1">
              <span className="label">Sport</span>
              <Select
                value={draft.sport}
                onChange={(e) =>
                  change({ sport: Number(e.target.value) as Sport })
                }
              >
                {SPORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              variant="primary"
              disabled={!records.length}
              title={fitFilename(draft.name)}
              onClick={exportFit}
            >
              Download .fit
            </Button>
          </div>
          <Stats className="gap-4">
            <Stat
              label="distance"
              value={((records.at(-1)?.distance ?? 0) / 1000).toFixed(2)}
              unit="km"
            />
            <Stat label="records" value={String(records.length)} />
            <Stat label="course points" value={String(points.length)} />
            <Stat
              label="ascent"
              value={totals ? String(Math.round(totals.ascent)) : "–"}
              unit="m"
            />
            <Stat
              label="descent"
              value={totals ? String(Math.round(totals.descent)) : "–"}
              unit="m"
            />
          </Stats>
        </div>

        <details open className="border-t border-line">
          <summary className="label cursor-pointer px-3 py-2">
            Elevation
          </summary>
          <div className="grid gap-2 px-3 pb-3">
            <div className="flex flex-wrap items-center gap-4">
              {(["valhalla", "mapterhorn"] as const).map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-1 font-bold"
                >
                  <input
                    type="radio"
                    name="elevation"
                    className="m-0 accent-green"
                    checked={settings.elevation === value}
                    onChange={() => set({ elevation: value })}
                  />
                  {SOURCE_LABELS[value]}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1">
                <span className="label">Record spacing</span>
                <Select
                  value={settings.spacing}
                  onChange={(e) => set({ spacing: Number(e.target.value) })}
                >
                  {[10, 25, 50, 100].map((m) => (
                    <option key={m} value={m}>
                      at most {m} m
                    </option>
                  ))}
                </Select>
              </label>
              {settings.elevation === "mapterhorn" && (
                <label className="grid gap-1">
                  <span className="label">Tile zoom</span>
                  <Select
                    value={settings.zoom}
                    onChange={(e) => set({ zoom: Number(e.target.value) })}
                  >
                    {[12, 13, 14, 15, 16, 17].map((z) => (
                      <option key={z} value={z}>
                        z{z}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
            </div>
            <Toggle
              checked={settings.flatten}
              onChange={(e) => set({ flatten: e.target.checked })}
              title="The elevation model has the valley under a bridge and the hill over a tunnel; this takes them straight from end to end, using the edges from trace_attributes"
            >
              Straighten bridges and tunnels
            </Toggle>
            {elevation.loading && (
              <p className="m-0 text-ink-muted">
                {elevation.progress
                  ? `Loading Mapterhorn tiles ${elevation.progress.done}/${elevation.progress.total}…`
                  : "Loading elevation…"}
              </p>
            )}
            {elevation.note && (
              <p className="m-0 text-ink-muted">{elevation.note}</p>
            )}
            {shownError && (
              <p role="alert" className="m-0 text-danger">
                {shownError} The course is written without altitudes.
              </p>
            )}
            {settings.elevation === "mapterhorn" && (
              <p className="m-0 text-ink-muted">
                Elevation{" "}
                <a href={MAPTERHORN_ATTRIBUTION_URL}>
                  {MAPTERHORN_ATTRIBUTION}
                </a>
              </p>
            )}
          </div>
        </details>

        <details open className="border-t border-line">
          <summary className="label cursor-pointer px-3 py-2">
            Suggestions{" "}
            <span className="text-ink-muted">{suggestions.length}</span>
          </summary>
          <div className="mx-3 mb-2 grid grid-cols-2 gap-2">
            <NumberSetting
              label="Turn alert, m early"
              value={settings.alertOffset}
              onChange={(alertOffset) => set({ alertOffset })}
            />
            <NumberSetting
              label="Steep from, %"
              value={settings.steepGrade}
              onChange={(steepGrade) => set({ steepGrade })}
            />
            <NumberSetting
              label="Distance marker every, km"
              value={settings.markerEvery}
              onChange={(markerEvery) => set({ markerEvery })}
            />
            <NumberSetting
              label="Summit prominence, m"
              value={settings.prominence}
              onChange={(prominence) => set({ prominence })}
            />
          </div>
          <SuggestionList
            suggestions={suggestions}
            pending={pending}
            onAccept={accept}
            onDismiss={(ids) =>
              change({ dismissed: [...draft.dismissed, ...ids] })
            }
            onHover={setHoveredSuggestion}
            onFocus={(s: Suggestion) => focus(s.point.lon, s.point.lat)}
          />
          {draft.dismissed.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="mx-3 mt-2"
              onClick={() => change({ dismissed: [] })}
            >
              Bring back {draft.dismissed.length} taken or dismissed
            </Button>
          )}
          <div className="h-3" />
        </details>

        <details open className="border-t border-line">
          <summary className="label cursor-pointer px-3 py-2">
            Course points{" "}
            <span className="text-ink-muted">{points.length}</span>
          </summary>
          <div className="mx-3 mb-2 flex gap-2">
            <Button
              size="sm"
              variant="danger"
              title="The course points of the route's maneuvers and legs again, without any edits"
              onClick={() => {
                const fresh = createDraft(source);
                change({ points: fresh.points, dismissed: [] });
              }}
            >
              Reset to the maneuvers
            </Button>
          </div>
          <PointList
            points={points}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              const p = points.find((q) => q.id === id);
              if (p) focus(p.lon, p.lat);
            }}
            onChange={(id, patch) =>
              setPoints(
                points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
              )
            }
            onDelete={(id) => setPoints(points.filter((p) => p.id !== id))}
          />
        </details>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MapView
          className="min-h-0 flex-1"
          options={{ center: [10, 50], zoom: 3, dragRotate: false }}
          onLoad={(loaded) =>
            fitTo(
              loaded,
              records.map((r) => [r.lon, r.lat]),
              { padding: 60, duration: 0 },
            )
          }
        >
          <Controls />
          <MapEvents
            onContextMenu={onContextMenu}
            onMoveStart={() => setMenu(null)}
          />
          <CourseLayers
            records={records}
            points={points}
            suggestions={suggestions}
            selected={selected}
            hoveredSuggestion={hoveredSuggestion}
            cursor={cursorAt}
            colors={colors}
            onSelect={setSelected}
            onMove={movePoint}
            onPointMenu={openPointMenu}
          />
        </MapView>
        {altitudes && (
          <Profile
            records={records}
            altitudes={altitudes}
            label={SOURCE_LABELS[settings.elevation]}
            other={
              otherAltitudes
                ? {
                    label:
                      SOURCE_LABELS[
                        settings.elevation === "valhalla"
                          ? "mapterhorn"
                          : "valhalla"
                      ],
                    altitudes: otherAltitudes,
                  }
                : null
            }
            points={points}
            hovered={cursor}
            onHover={setCursor}
            onSelect={setSelected}
          />
        )}
      </div>

      {menu && (
        <Menu
          at={menu.at}
          title={menu.title}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function NumberSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="label">{label}</span>
      <CommitInput
        type="number"
        min={0}
        value={String(value)}
        onCommit={(raw) => {
          const n = Number(raw);
          if (raw.trim() && Number.isFinite(n) && n >= 0) onChange(n);
        }}
      />
    </label>
  );
}
