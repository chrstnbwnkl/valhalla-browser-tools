import type { LngLat, Map as MapLibreMap } from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import { readUrlParam, useUrlParam } from "../../shared/hooks/urlParam";
import { useMap } from "../../shared/map/context";
import { Controls } from "../../shared/map/Controls";
import { fitTo } from "../../shared/map/fit";
import { MapView } from "../../shared/map/MapView";
import { useThemeColors } from "../../shared/theme/colors";
import { Button } from "../../shared/ui/Button";
import { CopyButton } from "../../shared/ui/CopyButton";
import { CommitInput, TextArea } from "../../shared/ui/Input";
import { Toggle } from "../../shared/ui/Toggle";
import { SavedViews } from "../../shared/valhalla/SavedViews";
import { ServerPicker } from "../../shared/valhalla/ServerPicker";
import { useServers } from "../../shared/valhalla/servers";
import { LocateMap } from "./LocateMap";
import { OptionFields } from "../../shared/valhalla/OptionFields";
import {
  INVALID_REQUEST,
  LOCATION_OPTIONS,
  isObject,
  locationsOf,
  newLocation,
  optionState,
  optionValue,
  parseRequest,
  positionOf,
  pretty,
  withOption,
  type LocateRequest,
  type Location,
  type Option,
} from "../../shared/valhalla/request";
import { ResultList } from "./ResultList";
import { buildResults, counts, type LocateResult } from "./results";

// the parameter Valhalla itself accepts on GET requests
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
  const servers = useServers();

  const [initial] = useState(initialText);
  const [text, setText] = useState(initial.text);
  const { request, error: parseError } = useMemo(
    () => parseRequest(text),
    [text],
  );
  const locations = useMemo(() => locationsOf(request), [request]);
  // the options new points get
  const [template, setTemplate] = useState<Location>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [response, setResponse] = useState<LocateResult[] | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [showCircles, setShowCircles] = useState(false);
  // the location whose options popup is open
  const [editing, setEditing] = useState<number | null>(null);
  // the JSON was typed into since the last send
  const edited = useRef(false);
  const pending = useRef<AbortController | null>(null);

  useUrlParam(URL_PARAM, request && JSON.stringify(request));
  const results = useMemo(
    () => (response ? buildResults(response, colors) : null),
    [response, colors],
  );

  const write = (next: LocateRequest) => setText(pretty(next));

  function clearResults() {
    pending.current?.abort();
    setResponse(null);
    setHighlighted(null);
    setStatus("");
  }

  function fitToPoints(
    req: LocateRequest,
    on: MapLibreMap | null,
    always = false,
  ) {
    const coords = locationsOf(req)
      .map(positionOf)
      .filter((at) => at !== null);
    if (!on || !coords.length) return;
    const bounds = on.getBounds();
    if (!always && coords.every((at) => bounds.contains(at))) return;
    fitTo(on, coords, { padding: 80, maxZoom: 16, duration: 0 });
  }

  function send(
    req: LocateRequest | null = request,
    server = servers.selected,
    on = map,
  ) {
    if (!req) return setError(INVALID_REQUEST);
    edited.current = false;
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
    setError(null);
    setStatus("Requesting…");
    fitToPoints(req, on);

    const started = performance.now();
    let data: unknown;
    try {
      // a string body is sent as text/plain, which avoids a CORS preflight
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
      return setError(
        isObject(data) && typeof data.error === "string"
          ? `Error ${JSON.stringify(data.error_code)}: ${data.error}`
          : "Unexpected response, see the network tab.",
      );
    }
    setResponse(data as LocateResult[]);
    setHighlighted(null);
    const { edges, nodes } = counts(data as LocateResult[]);
    setStatus(
      `${edges} edges · ${nodes} nodes · ${Math.round(performance.now() - started)} ms`,
    );
  }

  /** The request, or null after reporting that it doesn't parse. */
  function editable() {
    if (!request) setError(INVALID_REQUEST);
    return request;
  }

  /** Writes a request edited through the UI and sends it, if it has points. */
  function change(next: LocateRequest) {
    write(next);
    if (locationsOf(next).length) send(next);
    else clearResults();
  }

  function typed(value: string) {
    setText(value);
    setError(null);
    edited.current = true;
  }

  function setOption(option: Option, raw: string) {
    const req = editable();
    if (!req) return;
    const value = optionValue(option, raw);
    setTemplate(withOption(template, option.path, value));
    change({
      ...req,
      locations: locations.map((l) => withOption(l, option.path, value)),
    });
  }

  function setCosting(value: string) {
    const req = editable();
    if (!req) return;
    const { costing: _, ...rest } = req;
    change(value.trim() ? { ...req, costing: value.trim() } : rest);
  }

  function setVerbose(verbose: boolean) {
    const req = editable();
    if (req) change({ ...req, verbose });
  }

  function setLocationOption(index: number, option: Option, raw: string) {
    const req = editable();
    if (!req) return;
    const value = optionValue(option, raw);
    change({
      ...req,
      locations: locations.map((l, i) =>
        i === index ? withOption(l, option.path, value) : l,
      ),
    });
  }

  function locateAt(lngLat: LngLat) {
    // with a popup open, a click only closes it
    if (editing !== null) return setEditing(null);
    const req = editable();
    if (!req) return;
    change({ ...req, locations: [newLocation(lngLat, template)] });
  }

  function setLocations(next: Location[]) {
    setEditing(null);
    const req = editable();
    if (req) change({ ...req, locations: next });
  }

  function moveLocation(index: number, { lng, lat }: LngLat) {
    if (!request) return;
    const moved = { lat: +lat.toFixed(6), lon: +lng.toFixed(6) };
    change({
      ...request,
      locations: locations.map((l, i) =>
        i === index ? { ...l, ...moved } : l,
      ),
    });
  }

  return (
    <div className="flex h-screen">
      <aside className="caption flex w-[400px] flex-none flex-col border-r border-line bg-surface">
        <ServerPicker
          servers={servers}
          onError={setError}
          onSelect={(server) => locations.length && send(request, server)}
        />

        <TextArea
          mono
          aria-label="Request"
          className="mx-3 mt-3 h-[190px] w-auto flex-none resize-y px-3 py-2"
          spellCheck={false}
          placeholder="The /locate request JSON…"
          value={text}
          onChange={(e) => typed(e.target.value)}
          onBlur={() => edited.current && request && send()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
          }}
        />
        <div className="mx-3 mt-3 flex flex-none items-center gap-2">
          <Button variant="primary" title="Ctrl+Enter" onClick={() => send()}>
            Send
          </Button>
          <Button onClick={() => setLocations([])}>Clear points</Button>
          <CommitInput
            mono
            className="min-w-0 flex-1"
            list="costings"
            aria-label="costing"
            placeholder="costing"
            title="costing"
            spellCheck={false}
            value={typeof request?.costing === "string" ? request.costing : ""}
            onCommit={setCosting}
          />
          <datalist id="costings">
            {COSTINGS.map((costing) => (
              <option key={costing} value={costing} />
            ))}
          </datalist>
          <Toggle
            className="flex-none"
            checked={request?.verbose === true}
            onChange={(e) => setVerbose(e.target.checked)}
          >
            verbose
          </Toggle>
        </div>
        <p className="mx-3 mt-2 mb-0 text-ink-muted">
          Click the map to locate that point, right-click to add one. Drag a
          point to move it, hold it to set its own options, right-click it to
          remove it.
        </p>
        {(error ?? parseError) && (
          <p role="alert" className="mx-3 mt-2 mb-0 text-danger">
            {error ?? parseError}
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
            <OptionFields
              options={LOCATION_OPTIONS}
              valueOf={(option) =>
                optionState(
                  locations.length ? locations : [template],
                  option.path,
                )
              }
              onChange={setOption}
            />
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
        onLoad={(loaded) => {
          if (!initial.shared || !request) return;
          fitToPoints(request, loaded, true);
          if (locations.length) send(request, servers.selected, loaded);
        }}
      >
        <Controls />
        <LocateMap
          locations={locations}
          results={results}
          highlighted={highlighted}
          showCircles={showCircles}
          colors={colors}
          onClick={locateAt}
          onContextMenu={(lngLat) =>
            setLocations([...locations, newLocation(lngLat, template)])
          }
          onMoveLocation={moveLocation}
          onRemoveLocation={(index) =>
            setLocations(locations.filter((_, i) => i !== index))
          }
          editing={editing}
          onEdit={setEditing}
          onLocationOption={setLocationOption}
          onHover={setHighlighted}
        />
      </MapView>
    </div>
  );
}
