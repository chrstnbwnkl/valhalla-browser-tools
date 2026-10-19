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
import { SERVERS_KEY } from "../../shared/valhalla/servers";
import { VIEWS_KEY } from "../../shared/valhalla/views";
import { Map as FakeMap, LngLat } from "../../test/maplibre";
import { App, URL_PARAM } from "./App";
import { INVALID_REQUEST } from "./request";

const RESPONSE = [
  {
    input_lat: 52.5,
    input_lon: 13.4,
    edges: [
      {
        way_id: 123,
        correlated_lat: 52.5001,
        correlated_lon: 13.4001,
        side_of_street: "left",
        percent_along: 0.25,
        edge_info: {
          way_id: 123,
          names: ["Unter den Linden"],
          shape: "_izlhA~rlgdF_c`|@_c`|@",
        },
        edge: { forward: true },
        bounding_circle: { lat: 52.5, lon: 13.4, radius: 30 },
      },
    ],
    nodes: [
      {
        lat: 52.5002,
        lon: 13.4002,
        type: "street_intersection",
        edge_count: 4,
      },
    ],
  },
];

/** Answers every request with `body`, recording the requests. */
function serve(body: unknown = RESPONSE) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetch);
  return {
    fetch,
    /** The bodies sent, parsed. */
    sent: () =>
      fetch.mock.calls.map(([, init]) => JSON.parse(init.body as string)),
  };
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
const urlRequest = () =>
  JSON.parse(new URLSearchParams(location.search).get(URL_PARAM)!);
const markers = () =>
  screen.queryAllByTitle("Drag to move, right-click to remove");
const click = (
  map: FakeMap,
  lng: number,
  lat: number,
  target: EventTarget = map.getCanvas(),
) =>
  act(() =>
    map.fire("click", {
      lngLat: new LngLat(lng, lat),
      originalEvent: { target },
    }),
  );
const rightClick = (map: FakeMap, lng: number, lat: number) =>
  act(() =>
    map.fire("contextmenu", {
      lngLat: new LngLat(lng, lat),
      originalEvent: { preventDefault() {} },
    }),
  );

async function replaceRequest(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) {
  await user.clear(requestBox());
  await user.click(requestBox());
  await user.paste(text);
}

describe("locate playground", () => {
  it("starts with an empty request, also in the URL", async () => {
    await setup();
    expect(request()).toEqual({
      locations: [],
      costing: "auto",
      verbose: true,
    });
    expect(urlRequest()).toEqual(request());
    expect(screen.getByRole("combobox", { name: "costing" })).toHaveValue(
      "auto",
    );
    expect(screen.getByRole("checkbox", { name: "verbose" })).toBeChecked();
  });

  it("locates a clicked point and shows what was found", async () => {
    const { fetch, sent } = serve();
    const { map } = await setup();
    click(map, 13.4, 52.5);

    expect(request().locations).toEqual([{ lat: 52.5, lon: 13.4 }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://valhalla1.openstreetmap.de/locate",
      expect.anything(),
    );
    expect(sent()).toEqual([
      { locations: [{ lat: 52.5, lon: 13.4 }], costing: "auto", verbose: true },
    ]);

    const results = within(
      await screen.findByRole("list", { name: "Results" }),
    );
    expect(results.getByText("Location 1")).toBeInTheDocument();
    expect(results.getByText("Unter den Linden")).toBeInTheDocument();
    expect(results.getByRole("link", { name: "123" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/way/123",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /^1 edges · 1 nodes · \d+ ms$/,
    );
    expect(map.data("edges")!.features).toHaveLength(1);
    expect(map.data("points")!.features).toHaveLength(2);
    expect(map.data("snaps")!.features).toHaveLength(2);
    expect(markers().map((m) => m.textContent)).toEqual(["1"]);
  });

  it("ignores clicks on its own markers", async () => {
    const { fetch } = serve();
    const { map } = await setup();
    rightClick(map, 1, 1);
    click(map, 2, 2, markers()[0]);
    expect(request().locations).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends whenever points are added, moved or removed", async () => {
    const { sent } = serve();
    const { map } = await setup();
    rightClick(map, 1, 1);
    rightClick(map, 2, 2);
    expect(sent().map((r) => r.locations)).toEqual([
      [{ lat: 1, lon: 1 }],
      [
        { lat: 1, lon: 1 },
        { lat: 2, lon: 2 },
      ],
    ]);
    expect(markers().map((m) => m.textContent)).toEqual(["1", "2"]);

    const [first] = map.markers;
    act(() => first!.drag([4.1234567, 4]));
    expect(sent().at(-1).locations).toEqual([
      { lat: 4, lon: 4.123457 },
      { lat: 2, lon: 2 },
    ]);

    fireEvent.contextMenu(markers()[0]!);
    expect(request().locations).toEqual([{ lat: 2, lon: 2 }]);
    expect(sent().at(-1).locations).toEqual([{ lat: 2, lon: 2 }]);
    expect(markers().map((m) => m.textContent)).toEqual(["1"]);
  });

  it("clears the results instead of sending once no points are left", async () => {
    const { fetch } = serve();
    const { user, map } = await setup();
    click(map, 13.4, 52.5);
    await screen.findByRole("list", { name: "Results" });
    await user.click(screen.getByRole("button", { name: "Clear points" }));
    expect(request().locations).toEqual([]);
    expect(markers()).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("list", { name: "Results" }),
    ).not.toBeInTheDocument();
    expect(map.data("edges")!.features).toHaveLength(0);
  });

  it("sends typed JSON on Send, Ctrl+Enter or leaving the box, not while typing", async () => {
    const { fetch, sent } = serve();
    const { user } = await setup();
    await replaceRequest(user, '{"locations": [{"lat": 1, "lon": 1}]}');
    expect(fetch).not.toHaveBeenCalled();
    await user.tab();
    expect(sent()).toEqual([{ locations: [{ lat: 1, lon: 1 }] }]);

    // leaving it unedited doesn't resend
    await user.click(requestBox());
    await user.tab();
    expect(fetch).toHaveBeenCalledTimes(1);

    await user.click(requestBox());
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("doesn't send invalid JSON when leaving the box", async () => {
    const { fetch } = serve();
    const { user } = await setup();
    await replaceRequest(user, "{");
    await user.tab();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sets an option on every location, and on the points added after", async () => {
    const { user, map } = await setup();
    rightClick(map, 1, 1);
    rightClick(map, 2, 2);
    await user.type(screen.getByRole("spinbutton", { name: "radius" }), "25");
    expect(request().locations[0].radius).toBeUndefined(); // not until the input is left
    await user.tab();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "search_filter.exclude_toll" }),
      "true",
    );
    expect(request().locations).toEqual([
      { lat: 1, lon: 1, radius: 25, search_filter: { exclude_toll: true } },
      { lat: 2, lon: 2, radius: 25, search_filter: { exclude_toll: true } },
    ]);
    // the radius is drawn around each point
    expect(map.data("radius")!.features).toHaveLength(2);

    rightClick(map, 3, 3);
    expect(request().locations[2]).toEqual({
      lat: 3,
      lon: 3,
      radius: 25,
      search_filter: { exclude_toll: true },
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "search_filter.exclude_toll" }),
      "",
    );
    expect(request().locations[0]).toEqual({ lat: 1, lon: 1, radius: 25 });
  });

  it("applies a changed number or costing without leaving the field, e.g. from the spinner", async () => {
    const { sent } = serve();
    const { map } = await setup();
    click(map, 1, 1);
    fireEvent.change(screen.getByRole("spinbutton", { name: "radius" }), {
      target: { value: "30" },
    });
    await waitFor(() => expect(sent().at(-1).locations[0].radius).toBe(30));
    await waitFor(() => expect(map.data("radius")!.features).toHaveLength(1));

    fireEvent.change(screen.getByRole("combobox", { name: "costing" }), {
      target: { value: "pedestrian" },
    });
    await waitFor(() => expect(sent().at(-1).costing).toBe("pedestrian"));
  });

  it("sends a typed number once, not on every keystroke", async () => {
    const { fetch, sent } = serve();
    const { user, map } = await setup();
    click(map, 1, 1);
    await user.type(screen.getByRole("spinbutton", { name: "radius" }), "100");
    await waitFor(() => expect(sent().at(-1).locations[0].radius).toBe(100));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows what a typed request says, with options the locations disagree on as mixed", async () => {
    const { user } = await setup();
    await replaceRequest(
      user,
      JSON.stringify({
        costing: "pedestrian",
        locations: [
          { lat: 1, lon: 1, radius: 10, preferred_side: "same" },
          { lat: 2, lon: 2, radius: 10, preferred_side: "opposite" },
        ],
      }),
    );
    expect(screen.getByRole("combobox", { name: "costing" })).toHaveValue(
      "pedestrian",
    );
    expect(screen.getByRole("checkbox", { name: "verbose" })).not.toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "radius" })).toHaveValue(10);
    const side = screen.getByRole("combobox", { name: "preferred_side" });
    expect(side).toHaveValue("");
    expect(
      within(side).getByRole("option", { name: "mixed" }),
    ).toBeInTheDocument();
    expect(markers()).toHaveLength(2);
    expect(urlRequest().costing).toBe("pedestrian");
  });

  it("changes costing and verbose, and resends once live", async () => {
    const { sent } = serve();
    const { user, map } = await setup();
    click(map, 1, 1);
    await user.click(screen.getByRole("checkbox", { name: "verbose" }));
    expect(request().verbose).toBe(false);
    expect(sent().at(-1).verbose).toBe(false);

    const costing = () => screen.getByRole("combobox", { name: "costing" });
    await user.clear(costing());
    await user.type(costing(), "bicycle{Enter}");
    expect(request().costing).toBe("bicycle");
    expect(sent().at(-1).costing).toBe("bicycle");

    await user.clear(costing());
    await user.tab();
    expect(request()).not.toHaveProperty("costing");
  });

  it("refuses to use the map or inputs while the request is not valid JSON", async () => {
    const { user, map } = await setup();
    await replaceRequest(user, '{"locations": [');
    expect(screen.getByRole("alert")).toHaveTextContent(/JSON/);
    click(map, 1, 1);
    expect(screen.getByRole("alert")).toHaveTextContent(INVALID_REQUEST);
    expect(requestBox()).toHaveValue('{"locations": [');
    // the URL keeps the last valid request
    expect(urlRequest().locations).toEqual([]);
  });

  it("opens a shared request from the URL, sends it and shows its points", async () => {
    const { sent } = serve();
    const shared = { locations: [{ lat: 52.5, lon: 13.4 }], costing: "auto" };
    const { map } = await setup(
      `/?${new URLSearchParams({ [URL_PARAM]: JSON.stringify(shared) })}`,
    );
    expect(request()).toEqual(shared);
    await waitFor(() => expect(sent()).toEqual([shared]));
    expect(map.fitted!.contains([13.4, 52.5])).toBe(true);
    expect(map.fitted!.contains([13.5, 52.5])).toBe(false);
    await screen.findByRole("list", { name: "Results" });
  });

  it("keeps a shared request that does not parse as it is", async () => {
    const { fetch } = serve();
    await setup(`/?${URL_PARAM}=${encodeURIComponent("{oops")}`);
    expect(requestBox()).toHaveValue("{oops");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's error", async () => {
    serve({ error_code: 171, error: "No suitable edges near location" });
    const { map } = await setup();
    click(map, 1, 1);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error 171: No suitable edges near location",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const { map } = await setup();
    click(map, 1, 1);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Request to https://valhalla1.openstreetmap.de failed: Failed to fetch",
    );
  });

  it("highlights a result on the map and in the list, from either side", async () => {
    serve();
    const { user, map } = await setup();
    click(map, 13.4, 52.5);
    const results = within(
      await screen.findByRole("list", { name: "Results" }),
    );
    const filter = (layer: string) => map.getLayer(layer)!.filter;

    await user.hover(results.getByText("Unter den Linden"));
    expect(filter("edges-active")).toEqual(["==", ["get", "idx"], 0]);
    await user.unhover(results.getByText("Unter den Linden"));
    expect(filter("edges-active")).toEqual(["==", ["get", "idx"], -1]);

    act(() =>
      map.fire(
        "mousemove",
        { features: [{ properties: { idx: 1 } }] },
        "points",
      ),
    );
    expect(filter("points-active")).toEqual(["==", ["get", "idx"], 1]);
    expect(
      results.getByText("street_intersection · 4 edges").closest("details"),
    ).toHaveClass("bg-magenta-soft");
    act(() => map.fire("mouseleave", {}, "points"));
    expect(filter("points-active")).toEqual(["==", ["get", "idx"], -1]);
  });

  it("shows the JSON of a result once opened", async () => {
    serve();
    const { user, map } = await setup();
    click(map, 13.4, 52.5);
    const results = within(
      await screen.findByRole("list", { name: "Results" }),
    );
    expect(results.queryByText(/"side_of_street"/)).not.toBeInTheDocument();
    await user.click(results.getByText("Unter den Linden"));
    expect(results.getByText(/"side_of_street": "left"/)).toBeInTheDocument();
  });

  it("shows bounding circles only when asked to", async () => {
    serve();
    const { user, map } = await setup();
    expect(map.getLayer("circles")!.layout).toMatchObject({
      visibility: "none",
    });
    await user.click(
      screen.getByRole("checkbox", {
        name: "bounding circle of the hovered edge",
      }),
    );
    expect(map.getLayer("circles")!.layout).toMatchObject({
      visibility: "visible",
    });
  });

  it("copies the response", async () => {
    serve();
    const { user, map } = await setup();
    const copy = screen.getByRole("button", { name: "Copy response" });
    expect(copy).toBeDisabled();
    click(map, 13.4, 52.5);
    await waitFor(() => expect(copy).toBeEnabled());
    await user.click(copy);
    expect(JSON.parse(await navigator.clipboard.readText())).toEqual(RESPONSE);
  });

  it("adds a server, uses it and resends to it when live", async () => {
    const { fetch } = serve();
    const { user, map } = await setup();
    click(map, 1, 1);
    await user.type(
      screen.getByPlaceholderText(/Add a server/),
      "localhost:9000",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByRole("combobox", { name: "Valhalla server" }),
    ).toHaveValue("http://localhost:9000");
    expect(fetch).toHaveBeenLastCalledWith(
      "http://localhost:9000/locate",
      expect.anything(),
    );
    expect(JSON.parse(localStorage.getItem(SERVERS_KEY)!)).toEqual({
      added: ["http://localhost:9000"],
      selected: "http://localhost:9000",
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(
      screen.getByRole("combobox", { name: "Valhalla server" }),
    ).toHaveValue("https://valhalla1.openstreetmap.de");
  });

  it("rejects a server address that is not one", async () => {
    const { user } = await setup();
    await user.type(screen.getByPlaceholderText(/Add a server/), "http://");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That is not a valid server address.",
    );
  });

  it("saves map views, jumps to them and forgets them", async () => {
    const { user, map } = await setup();
    map.jumpTo({ center: [13.4049999, 52.52], zoom: 11.123 });
    await user.type(
      screen.getByPlaceholderText(/Save this map view/),
      "Berlin{Enter}",
    );
    expect(JSON.parse(localStorage.getItem(VIEWS_KEY)!)).toEqual([
      { name: "Berlin", center: [13.405, 52.52], zoom: 11.12 },
    ]);

    map.jumpTo({ center: [0, 0], zoom: 1 });
    await user.click(screen.getByRole("button", { name: "Berlin" }));
    expect(map.getCenter()).toMatchObject({ lng: 13.405, lat: 52.52 });

    await user.click(screen.getByRole("button", { name: "×" }));
    expect(
      screen.queryByRole("button", { name: "Berlin" }),
    ).not.toBeInTheDocument();
  });
});
