import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapProvider } from "../../shared/map/context";
import { LONG_PRESS_MS } from "../../shared/map/Marker";
import { Map as FakeMap, LngLat } from "../../test/maplibre";
import { TerraDraw } from "../../test/terra-draw";
import { App, FILTERS_KEY, URL_PARAM } from "./App";
import mapMatched from "./fixtures/map-match.json";
import route from "./fixtures/route.json";
import leg0 from "./fixtures/trace-leg0.json";
import leg1 from "./fixtures/trace-leg1.json";

const A = new LngLat(13.3888, 52.517);
const B = new LngLat(13.3925, 52.5163);
const C = new LngLat(13.3955, 52.5145);

type Answer = (body: Record<string, unknown>) => unknown;

/** Answers like a Valhalla server, from the recorded responses, recording the requests. */
function serve({
  route: answerRoute = () => route,
  trace,
}: { route?: Answer; trace?: Answer } = {}) {
  let legs = 0;
  const answerTrace: Answer =
    trace ??
    ((body) => ("shape" in body ? mapMatched : [leg0, leg1][legs++ % 2]));
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const answer = url.endsWith("/route") ? answerRoute : answerTrace;
    return { json: async () => answer(body) };
  });
  vi.stubGlobal("fetch", fetch);
  const sent = (endpoint: string) =>
    fetch.mock.calls
      .filter(([url]) => url.endsWith(`/${endpoint}`))
      .map(([, init]) => JSON.parse(init.body as string));
  return { fetch, sent };
}

async function setup(url = "/") {
  history.replaceState(null, "", url);
  const user = userEvent.setup();
  render(
    <MapProvider>
      <App />
    </MapProvider>,
  );
  await waitFor(() =>
    expect(FakeMap.instances.at(-1)!.sources.size).toBeGreaterThan(0),
  );
  return { user, map: FakeMap.instances.at(-1)! };
}

const requestBox = () =>
  screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Request" });
const request = () => JSON.parse(requestBox().value);
const markers = () => screen.queryAllByTitle(/^Drag to move/);
const click = (
  map: FakeMap,
  at: LngLat,
  target: EventTarget = map.getCanvas(),
) =>
  act(() =>
    map.fire("click", {
      lngLat: at,
      point: { x: 0, y: 0 },
      originalEvent: { target },
    }),
  );
const rightClick = (map: FakeMap, at: LngLat) =>
  act(() =>
    map.fire("contextmenu", {
      lngLat: at,
      point: { x: 0, y: 0 },
      originalEvent: { preventDefault() {}, clientX: 10, clientY: 10 },
    }),
  );

/** A routed request with the three recorded waypoints. */
async function routed() {
  const server = serve();
  const { user, map } = await setup();
  click(map, A);
  click(map, B);
  click(map, C);
  await screen.findByRole("list", { name: "Steps" });
  return { ...server, user, map };
}

describe("route playground", () => {
  it("starts with an empty request in the format that has weights", async () => {
    await setup();
    expect(request()).toEqual({
      locations: [],
      costing: "auto",
      format: "osrm",
    });
  });

  it("routes once there are two waypoints, and shows the steps and their weights", async () => {
    const { sent, map } = await routed();
    expect(sent("route")).toHaveLength(2);
    expect(sent("route").at(-1)).toMatchObject({
      format: "osrm",
      locations: [
        { lat: 52.517, lon: 13.3888 },
        { lat: 52.5163, lon: 13.3925 },
        { lat: 52.5145, lon: 13.3955 },
      ],
    });
    expect(markers().map((m) => m.textContent)).toEqual(["1", "2", "3"]);
    expect(screen.getByRole("status")).toHaveTextContent(/^1 route · \d+ ms$/);
    expect(screen.getByText("weight (auto)").nextSibling).toHaveTextContent(
      "2319.162",
    );

    const steps = within(screen.getByRole("list", { name: "Steps" }));
    expect(steps.getByText(/^Leg 0 · weight 1132.184/)).toBeInTheDocument();
    expect(steps.getAllByText("= Σ steps")).toHaveLength(2);
    expect(
      steps.getAllByText("Turn left onto Behrenstraße.")[0],
    ).toBeInTheDocument();
    expect(map.data("steps")!.features).toHaveLength(12);
    // a weight label per step but the arrivals, a turn label per turn weight
    expect(screen.getAllByTitle(/^step \d+ weight$/)).toHaveLength(10);
    expect(screen.getAllByTitle(/turn_weight$/).length).toBeGreaterThan(10);
  });

  it("clears the route when fewer than two waypoints are left", async () => {
    const { user, sent } = await routed();
    await user.click(screen.getByRole("button", { name: "Clear points" }));
    expect(request().locations).toEqual([]);
    expect(
      screen.queryByRole("list", { name: "Steps" }),
    ).not.toBeInTheDocument();
    expect(sent("route")).toHaveLength(2);
  });

  it("inserts waypoints where the map's menu says, and copies the position", async () => {
    const { user, map, sent } = await routed();
    rightClick(map, new LngLat(13.39, 52.516));
    const menu = within(screen.getByRole("menu", { name: "New waypoint" }));
    expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "Insert as the start",
      "Insert between 1 and 2",
      "Insert between 2 and 3",
      "Append as the end",
      "Copy 13.390000,52.516000",
      "Copy as Valhalla location",
    ]);
    await user.click(
      menu.getByRole("menuitem", { name: "Insert between 1 and 2" }),
    );
    expect(request().locations[1]).toEqual({ lat: 52.516, lon: 13.39 });
    expect(sent("route").at(-1).locations).toHaveLength(4);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    rightClick(map, new LngLat(13.39, 52.516));
    await user.click(
      screen.getByRole("menuitem", { name: "Copy 13.390000,52.516000" }),
    );
    expect(await navigator.clipboard.readText()).toBe("13.390000,52.516000");
  });

  it("deletes and reorders a waypoint from its menu", async () => {
    const { user, sent } = await routed();
    fireEvent.contextMenu(markers()[0]!);
    const menu = within(screen.getByRole("menu", { name: "Waypoint 1" }));
    await user.click(
      menu.getByRole("menuitem", { name: "Move to position 3 (end)" }),
    );
    expect(request().locations.map((l: { lon: number }) => l.lon)).toEqual([
      13.3925, 13.3955, 13.3888,
    ]);
    expect(sent("route")).toHaveLength(3);

    fireEvent.contextMenu(markers()[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(request().locations).toHaveLength(2);
    expect(sent("route")).toHaveLength(4);
  });

  it("ignores clicks on its labels and waypoints", async () => {
    const { map, sent } = await routed();
    click(map, A, screen.getByTitle("step 1 weight"));
    click(map, A, markers()[0]);
    expect(request().locations).toHaveLength(3);
    expect(sent("route")).toHaveLength(2);
  });

  it("closes a menu with Escape or when the map moves", async () => {
    const { user, map } = await routed();
    rightClick(map, A);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    rightClick(map, A);
    act(() => map.fire("movestart", {}));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("routes again when a waypoint is dragged", async () => {
    const { map, sent } = await routed();
    const [first] = map.markers;
    act(() => first!.drag([13.38881234, 52.517]));
    expect(sent("route").at(-1).locations[0]).toEqual({
      lat: 52.517,
      lon: 13.388812,
    });
  });

  it("sets costing options of the request's costing", async () => {
    const { user, sent } = await routed();
    await user.click(screen.getByText("Costing options"));
    expect(screen.getByText("— of auto")).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "exclude_tolls" }),
      "true",
    );
    expect(request().costing_options).toEqual({
      auto: { exclude_tolls: true },
    });
    expect(sent("route").at(-1).costing_options).toEqual({
      auto: { exclude_tolls: true },
    });

    const costing = () => screen.getByRole("combobox", { name: "costing" });
    await user.clear(costing());
    await user.type(costing(), "pedestrian{Enter}");
    expect(screen.getByText("— of pedestrian")).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "walking_speed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "exclude_tolls" })).toHaveValue(
      "",
    );
  });

  it("sets location options on every waypoint, or on one held", async () => {
    const { user, sent } = await routed();
    await user.click(screen.getByText("Location options"));
    await user.selectOptions(
      screen.getAllByRole("combobox", { name: "type" })[0]!,
      "via",
    );
    expect(request().locations.map((l: { type: string }) => l.type)).toEqual([
      "via",
      "via",
      "via",
    ]);

    fireEvent.pointerDown(markers()[1]!, { button: 0, clientX: 0, clientY: 0 });
    const popup = within(
      await screen.findByRole("dialog", { name: "Waypoint 2 options" }),
    );
    await user.selectOptions(
      popup.getByRole("combobox", { name: "type" }),
      "break",
    );
    expect(request().locations.map((l: { type: string }) => l.type)).toEqual([
      "via",
      "break",
      "via",
    ]);
    expect(sent("route").at(-1).locations[1].type).toBe("break");
  });

  it("shows the edges of each leg from trace_attributes, themed by an attribute", async () => {
    const { user, sent, map } = await routed();
    await user.click(screen.getByRole("radio", { name: "Edges" }));
    const edges = within(await screen.findByRole("list", { name: "Edges" }));
    expect(sent("trace_attributes").map((t) => t.shape_match)).toEqual([
      "edge_walk",
      "edge_walk",
    ]);
    expect(sent("trace_attributes")[0]).toMatchObject({ costing: "auto" });
    expect(edges.getAllByText(/^#\d+/)).toHaveLength(
      leg0.edges.length + leg1.edges.length,
    );
    expect(edges.getByText(/^Leg 1 · 25 edges/)).toBeInTheDocument();
    expect(screen.getByText("edges").nextSibling).toHaveTextContent("48");
    expect(map.data("edges")!.features.length).toBeGreaterThan(40);
    expect(
      screen.getByRole("button", { name: "trace_attributes response" }),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Edge theme" }),
      "road_class",
    );
    const legend = within(screen.getByLabelText("Legend"));
    expect(
      legend.getByText(String(leg0.edges[0]!.road_class)),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByText(String(leg0.edges[0]!.road_class)).length,
    ).toBeGreaterThan(1);

    const labels = () =>
      map.getContainer().querySelectorAll(".pointer-events-none").length;
    expect(labels()).toBe(0);
    await user.click(screen.getByRole("checkbox", { name: "Edge labels" }));
    expect(labels()).toBe(leg0.edges.length + leg1.edges.length);

    // once per route: back and forth doesn't trace again
    await user.click(screen.getByRole("radio", { name: "Maneuvers" }));
    await user.click(screen.getByRole("radio", { name: "Edges" }));
    expect(sent("trace_attributes")).toHaveLength(2);
  });

  it("map matches a leg whose edge walk fails, and says so", async () => {
    let calls = 0;
    const { user } = await routed();
    serve({
      trace: (body) =>
        body.shape_match === "edge_walk"
          ? calls++ === 0
            ? { error_code: 443, error: "Exact route match algorithm failed" }
            : leg1
          : leg0,
    });
    await user.click(screen.getByRole("radio", { name: "Edges" }));
    await screen.findByRole("list", { name: "Edges" });
    expect(screen.getByText("map-matched")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "edge_walk failed for leg 0",
    );
  });

  it("asks trace_attributes for the filtered attributes, and traces again when the filter changes", async () => {
    const { user, sent } = await routed();
    await user.click(screen.getByRole("radio", { name: "Edges" }));
    await screen.findByRole("list", { name: "Edges" });

    await user.click(screen.getByRole("button", { name: "Attribute filter…" }));
    const dialog = within(
      screen.getByRole("dialog", { name: "Attribute filter" }),
    );
    await user.type(dialog.getByRole("textbox", { name: "Filter" }), "nope");
    await user.click(dialog.getByRole("button", { name: "Apply" }));
    expect(dialog.getByRole("alert")).toBeInTheDocument();

    await user.clear(dialog.getByRole("textbox", { name: "Filter" }));
    await user.click(dialog.getByRole("textbox", { name: "Filter" }));
    await user.paste(
      '{"filters": {"attributes": ["edge.names"], "action": "include"}}',
    );
    await user.click(dialog.getByRole("button", { name: "Apply" }));
    expect(
      screen.queryByRole("dialog", { name: "Attribute filter" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Attribute filter: include 1…" }),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(FILTERS_KEY)!)).toEqual({
      attributes: ["edge.names"],
      action: "include",
    });
    await waitFor(() => expect(sent("trace_attributes")).toHaveLength(4));
    expect(sent("trace_attributes").at(-1).filters.attributes).toContain(
      "edge.names",
    );
  });

  it("switches between alternative routes", async () => {
    const second = { ...route.routes[0]!, weight: 9999 };
    serve({ route: () => ({ ...route, routes: [route.routes[0], second] }) });
    const { user, map } = await setup();
    click(map, A);
    click(map, C);
    const routes = await screen.findByRole("combobox", { name: "Route" });
    expect(screen.getByRole("status")).toHaveTextContent(/^2 routes/);
    expect(map.data("alternatives")!.features).toHaveLength(1);
    await user.selectOptions(routes, "1");
    expect(screen.getByText("weight (auto)").nextSibling).toHaveTextContent(
      "9999",
    );
  });

  it("inspects what the response says about a feature clicked on the map", async () => {
    const { map } = await routed();
    vi.spyOn(map, "queryRenderedFeatures").mockImplementation(
      (_point, options) =>
        options?.layers?.includes("waypoints")
          ? [
              {
                layer: { id: "waypoints" },
                properties: { i: 1 },
                geometry: { type: "Point", coordinates: [13.39, 52.51] },
              },
            ]
          : [],
    );
    click(map, A);
    const popup = await screen.findByRole("dialog", { name: "waypoint 1" });
    expect(popup).toHaveTextContent(
      `location: ${JSON.stringify(route.waypoints[1]!.location)}`,
    );
    // the next click only closes it
    click(map, A);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(request().locations).toHaveLength(3);
  });

  it("highlights a step on the map and in the list", async () => {
    const { user, map } = await routed();
    await user.hover(screen.getAllByText("Turn left onto Behrenstraße.")[0]!);
    expect(map.getLayer("steps-active")!.filter).toEqual([
      "==",
      ["get", "idx"],
      1,
    ]);
    act(() =>
      map.fire(
        "mousemove",
        { features: [{ properties: { idx: 3 } }] },
        "steps",
      ),
    );
    expect(map.getLayer("steps-active")!.filter).toEqual([
      "==",
      ["get", "idx"],
      3,
    ]);
    expect(screen.getByTitle("step 3 weight")).toHaveClass("bg-magenta-soft");
  });

  it("draws exclude polygons into the request", async () => {
    const { user, sent } = await routed();
    const terra = TerraDraw.instances.at(-1)!;
    await user.click(screen.getByRole("button", { name: "Exclude polygon" }));
    expect(terra.mode).toBe("polygon");
    const ring = [
      [13.39, 52.515],
      [13.392, 52.515],
      [13.392, 52.517],
      [13.39, 52.515],
    ];
    act(() => terra.finish([ring]));
    expect(request().exclude_polygons).toEqual([ring]);
    expect(sent("route").at(-1).exclude_polygons).toEqual([ring]);
    expect(terra.drawn).toBe(0);

    // clicking the active mode again ends drawing
    await user.click(screen.getByRole("button", { name: "Exclude polygon" }));
    expect(terra.mode).toBe("static");
    await user.click(
      screen.getByRole("button", { name: "Delete all polygons" }),
    );
    expect(request()).not.toHaveProperty("exclude_polygons");
  });

  it("map matches a drawn cost line and lets its factor be set", async () => {
    const { user, sent } = await routed();
    const terra = TerraDraw.instances.at(-1)!;
    await user.click(screen.getByRole("button", { name: "Cost line" }));
    act(() =>
      terra.finish([
        [13.39, 52.516],
        [13.3915, 52.5158],
      ]),
    );
    await waitFor(() =>
      expect(request().linear_cost_factors).toEqual([
        { shape: mapMatched.shape, factor: 1 },
      ]),
    );
    expect(sent("trace_attributes").at(-1)).toMatchObject({
      shape_match: "map_snap",
      costing: "auto",
    });

    await user.click(screen.getByRole("button", { name: "× 1" }));
    const popup = within(screen.getByRole("dialog", { name: "Cost line" }));
    await user.clear(popup.getByRole("spinbutton", { name: "factor" }));
    await user.type(
      popup.getByRole("spinbutton", { name: "factor" }),
      "5{Enter}",
    );
    expect(request().linear_cost_factors[0].factor).toBe(5);
    expect(sent("route").at(-1).linear_cost_factors[0].factor).toBe(5);
    expect(screen.getByRole("button", { name: "× 5" })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("dialog", { name: "Cost line" })).getByRole(
        "button",
        { name: "Delete" },
      ),
    );
    expect(request()).not.toHaveProperty("linear_cost_factors");
  });

  it("shows the server's error", async () => {
    serve({
      route: () => ({
        error_code: 442,
        error: "No path could be found for input",
      }),
    });
    const { map } = await setup();
    click(map, A);
    click(map, C);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error 442: No path could be found for input",
    );
  });

  it("sends typed JSON when leaving the box, not while typing", async () => {
    const { sent } = serve();
    const { user } = await setup();
    await user.clear(requestBox());
    await user.click(requestBox());
    await user.paste(
      JSON.stringify({
        locations: [
          { lat: 52.517, lon: 13.3888 },
          { lat: 52.5145, lon: 13.3955 },
        ],
      }),
    );
    expect(sent("route")).toHaveLength(0);
    await user.tab();
    expect(sent("route")).toHaveLength(1);
  });

  it("opens a shared request, routes it and shows its waypoints", async () => {
    const { sent } = serve();
    const shared = {
      locations: [
        { lat: 52.517, lon: 13.3888 },
        { lat: 52.5145, lon: 13.3955 },
      ],
      costing: "auto",
    };
    const { map } = await setup(
      `/?${new URLSearchParams({ [URL_PARAM]: JSON.stringify(shared) })}`,
    );
    await waitFor(() =>
      expect(sent("route")).toEqual([{ ...shared, format: "osrm" }]),
    );
    expect(map.fitted!.contains([13.3888, 52.517])).toBe(true);
    expect(map.fitted!.contains([13.5, 52.517])).toBe(false);
  });

  it("only opens a held waypoint's options after holding", async () => {
    await routed();
    fireEvent.pointerDown(markers()[0]!, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(markers()[0]!);
    await act(
      () => new Promise((done) => setTimeout(done, LONG_PRESS_MS + 50)),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
