import {
  LngLatBounds,
  type LngLat,
  type Map as MapLibreMap,
} from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import { useMap } from "../../shared/map/context";
import { MapView } from "../../shared/map/MapView";
import { readUrlParam, useUrlParam } from "../../shared/hooks/urlParam";
import { useThemeColors } from "../../shared/theme/colors";
import { Button } from "../../shared/ui/Button";
import { CopyButton } from "../../shared/ui/CopyButton";
import { CommitInput, TextArea } from "../../shared/ui/Input";
import { Toggle } from "../../shared/ui/Toggle";
import { SavedViews } from "../../shared/valhalla/SavedViews";
import { ServerPicker } from "../../shared/valhalla/ServerPicker";
import { useServers } from "../../shared/valhalla/servers";
import { LocateMap } from "./LocateMap";
import { OptionFields } from "./OptionFields";
import { ResultList } from "./ResultList";
import {
  INVALID_REQUEST,
  NO_FIELDS,
  fieldsFor,
  isObject,
  locationsOf,
  newLocation,
  optionValue,
  parseRequest,
  positionOf,
  pretty,
  rawLocations,
  withOption,
  type Fields,
  type LocateRequest,
  type Option,
} from "./request";
import { buildResults, counts, type LocateResult } from "./results";

// which server this tool uses; before the added servers were shared, it held this tool's own as well
const SELECTED_SERVER_KEY = "locate-visualizer:servers";
// the request travels in this URL parameter, the same one Valhalla itself accepts on GET requests
export const URL_PARAM = "json";
const DEFAULT_REQUEST = { locations: [], costing: "auto", verbose: true };
const COSTINGS = [
  "auto",
  "bicycle",
  "bus",
  "motor_scooter",
  "motorcycle",
  "pedestrian",
  "taxi",
  "truck",
];

/** What the inputs above the options show; they follow the request when it is typed, pasted or opened. */
type Controls = { costing: string; verbose: boolean; fields: Fields };

function controlsFor(
  request: LocateRequest | null,
  current: Controls,
): Controls {
  if (!request) return current;
  return {
    costing: typeof request.costing === "string" ? request.costing : "",
    verbose: request.verbose === true,
    fields: fieldsFor(request, current.fields),
  };
}

// the request the page opens with: the shared one from the URL, or a fresh one
function initialText() {
  const shared = readUrlParam(URL_PARAM);
  if (shared === null) return { text: pretty(DEFAULT_REQUEST), shared: false };
  try {
    return { text: pretty(JSON.parse(shared)), shared: true };
  } catch {
    return { text: shared, shared: true };
  }
}

export function App() {
  const map = useMap();
  const colors = useThemeColors();
  const servers = useServers(SELECTED_SERVER_KEY);

  const [initial] = useState(initialText);
  const [text, setText] = useState(initial.text);
  const parsed = useMemo(() => parseRequest(text), [text]);
  const { request } = parsed;
  const [controls, setControls] = useState(() =>
    controlsFor(parseRequest(initial.text).request, {
      costing: "",
      verbose: false,
      fields: NO_FIELDS,
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [response, setResponse] = useState<LocateResult[] | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [showCircles, setShowCircles] = useState(false);

  // Once the request has been sent, changing an option or dragging a point sends it again. Adding or removing
  // points turns that off until the next Send.
  const live = useRef(false);
  // the request was typed, pasted or came with the URL, so the map may not show its points yet
  const unseen = useRef(initial.shared);
  const pending = useRef<AbortController | null>(null);

  useUrlParam(URL_PARAM, request ? JSON.stringify(request) : null);
  const results = useMemo(
    () => (response ? buildResults(response, colors) : null),
    [response, colors],
  );

  /** Replaces the request, from code. */
  const write = (next: LocateRequest) => setText(pretty(next));

  function clearResults() {
    pending.current?.abort();
    setResponse(null);
    setHighlighted(null);
    setStatus("");
  }

  // Moves the map to the points of a request that didn't come from clicking it, or that are out of view.
  function showInputs(req: LocateRequest, on: MapLibreMap | null) {
    const coords = rawLocations(req)
      .map(positionOf)
      .filter((at) => at !== null);
    if (!on || !coords.length) return;
    const bounds = on.getBounds();
    if (!unseen.current && coords.every((at) => bounds.contains(at))) return;
    unseen.current = false;
    const all = coords.reduce((b, at) => b.extend(at), new LngLatBounds());
    on.fitBounds(all, { padding: 80, maxZoom: 16, duration: 0 });
  }

  /** Sends the request, to the server in use unless told otherwise, and shows the results. */
  function send(
    req: LocateRequest | null = request,
    server = servers.selected,
    on = map,
  ) {
    if (!req) return setError(INVALID_REQUEST);
    void locate(req, server, on);
  }

  async function locate(
    req: LocateRequest,
    server: string,
    on: MapLibreMap | null,
  ) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    live.current = true;
    setError(null);
    setStatus("Requesting…");
    showInputs(req, on);

    const started = performance.now();
    let data: unknown;
    try {
      // a string body is sent as text/plain, which spares the CORS preflight; Valhalla parses it as JSON anyway
      const res = await fetch(`${server}/locate`, {
        method: "POST",
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      data = await res.json();
    } catch (e) {
      if (controller.signal.aborted) return;
      clearResults();
      return setError(`Request to ${server} failed: ${(e as Error).message}`);
    }
    if (controller.signal.aborted) return;
    if (!Array.isArray(data)) {
      clearResults();
      const failure =
        isObject(data) && typeof data.error === "string"
          ? `Error ${JSON.stringify(data.error_code)}: ${data.error}`
          : null;
      return setError(failure ?? "Unexpected response, see the network tab.");
    }
    setResponse(data as LocateResult[]);
    setHighlighted(null);
    const { edges, nodes } = counts(data as LocateResult[]);
    setStatus(
      `${edges} edges · ${nodes} nodes · ${Math.round(performance.now() - started)} ms`,
    );
  }

  /** The request to change, or null after saying it can't be. */
  function editable() {
    if (!request) setError(INVALID_REQUEST);
    return request;
  }

  /** Writes a changed request and sends it again if the results follow it. */
  function change(next: LocateRequest) {
    write(next);
    if (live.current) send(next);
  }

  function typed(value: string) {
    setText(value);
    setError(null);
    unseen.current = true;
    setControls((current) => controlsFor(parseRequest(value).request, current));
  }

  function setOption(option: Option, raw: string) {
    const req = editable();
    if (!req) return;
    const value = optionValue(option, raw);
    setControls((current) => {
      const mixed = new Set(current.fields.mixed);
      mixed.delete(option.path);
      return {
        ...current,
        fields: {
          values: { ...current.fields.values, [option.path]: raw },
          mixed,
        },
      };
    });
    change({
      ...req,
      locations: rawLocations(req).map((l) =>
        isObject(l) ? withOption(l, option.path, value) : l,
      ),
    });
  }

  function setCosting(value: string) {
    const req = editable();
    if (!req) return;
    setControls((current) => ({ ...current, costing: value }));
    const { costing: _, ...rest } = req;
    change(value.trim() ? { ...req, costing: value.trim() } : rest);
  }

  function setVerbose(verbose: boolean) {
    const req = editable();
    if (!req) return;
    setControls((current) => ({ ...current, verbose }));
    change({ ...req, verbose });
  }

  function locateAt(lngLat: LngLat) {
    const req = editable();
    if (!req) return;
    const next = { ...req, locations: [newLocation(lngLat, controls.fields)] };
    write(next);
    send(next);
  }

  function addLocation(lngLat: LngLat) {
    const req = editable();
    if (!req) return;
    live.current = false;
    clearResults();
    write({
      ...req,
      locations: [...rawLocations(req), newLocation(lngLat, controls.fields)],
    });
  }

  function moveLocation(index: number, { lng, lat }: LngLat) {
    if (!request) return;
    const locations = rawLocations(request).map((location, i) =>
      i === index
        ? {
            ...(location as object),
            lat: +lat.toFixed(6),
            lon: +lng.toFixed(6),
          }
        : location,
    );
    change({ ...request, locations });
  }

  function removeLocation(index: number) {
    if (!request) return;
    clearResults();
    write({
      ...request,
      locations: rawLocations(request).filter((_, i) => i !== index),
    });
  }

  function clearLocations() {
    const req = editable();
    if (!req) return;
    live.current = false;
    clearResults();
    write({ ...req, locations: [] });
  }

  return (
    <div className="flex h-screen">
      <aside className="caption flex w-[400px] flex-none flex-col border-r border-line bg-surface">
        <ServerPicker
          servers={servers}
          onError={setError}
          onSelect={(server) => live.current && send(request, server)}
        />

        <TextArea
          mono
          aria-label="Request"
          className="mx-3 mt-3 h-[190px] w-auto flex-none resize-y px-3 py-2"
          spellCheck={false}
          placeholder="The /locate request JSON…"
          value={text}
          onChange={(e) => typed(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
          }}
        />
        <div className="mx-3 mt-3 flex flex-none items-center gap-2">
          <Button variant="primary" title="Ctrl+Enter" onClick={() => send()}>
            Send
          </Button>
          <Button onClick={clearLocations}>Clear points</Button>
          <CommitInput
            mono
            className="min-w-0 flex-1"
            list="costings"
            aria-label="costing"
            placeholder="costing"
            title="costing"
            spellCheck={false}
            value={controls.costing}
            onCommit={setCosting}
          />
          <datalist id="costings">
            {COSTINGS.map((costing) => (
              <option key={costing} value={costing} />
            ))}
          </datalist>
          <Toggle
            className="flex-none"
            checked={controls.verbose}
            onChange={(e) => setVerbose(e.target.checked)}
          >
            verbose
          </Toggle>
        </div>
        <p className="mx-3 mt-2 mb-0 text-ink-muted">
          Click the map to locate that point. Right-click to add points, then
          Send. Drag a point to move it, right-click it to remove it.
        </p>
        {(error ?? parsed.error) && (
          <p role="alert" className="mx-3 mt-2 mb-0 text-danger">
            {error ?? parsed.error}
          </p>
        )}
        {status && (
          <p
            role="status"
            className="mx-3 mt-2 mb-0 font-mono text-ink-muted tabular-nums"
          >
            {status}
          </p>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-line">
          <details open>
            <summary className="label cursor-pointer px-3 py-2">
              Location options{" "}
              <small className="font-medium text-ink-muted">
                — set on every location; empty uses the server default
              </small>
            </summary>
            <OptionFields fields={controls.fields} onChange={setOption} />
          </details>
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            <Toggle
              title="Only verbose responses have bounding circles"
              checked={showCircles}
              onChange={(e) => setShowCircles(e.target.checked)}
            >
              bounding circle of the hovered edge
            </Toggle>
            <CopyButton
              size="sm"
              disabled={!response}
              text={response ? pretty(response) : ""}
            >
              Copy response
            </CopyButton>
          </div>
          {results && (
            <ResultList
              sections={results.sections}
              highlighted={highlighted}
              onHover={setHighlighted}
            />
          )}
        </div>

        <SavedViews />
      </aside>

      <MapView
        className="flex-1"
        options={{ center: [10, 50], zoom: 3, dragRotate: false }}
        // a shared request with points is sent right away, once the map can show where they are
        onLoad={(loaded) =>
          initial.shared &&
          locationsOf(request).length &&
          send(request, servers.selected, loaded)
        }
      >
        <LocateMap
          locations={rawLocations(request)}
          results={results}
          highlighted={highlighted}
          showCircles={showCircles}
          colors={colors}
          onClick={locateAt}
          onContextMenu={addLocation}
          onMoveLocation={moveLocation}
          onRemoveLocation={removeLocation}
          onHover={setHighlighted}
        />
      </MapView>
    </div>
  );
}
