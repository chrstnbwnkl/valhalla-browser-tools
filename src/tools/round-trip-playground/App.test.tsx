import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapProvider } from "../../shared/map/context";
import { Map as FakeMap, LngLat } from "../../test/maplibre";
import route from "../route-playground/fixtures/route.json";
import { App, URL_PARAM } from "./App";

const START = new LngLat(13.3888, 52.517);

/** Answers every request with `body`, recording the requests. */
function serve(body: unknown = route) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetch);
  return {
    fetch,
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
const click = (map: FakeMap, at: LngLat) =>
  act(() =>
    map.fire("click", {
      lngLat: at,
      point: { x: 0, y: 0 },
      originalEvent: { target: map.getCanvas() },
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

describe("round trip playground", () => {
  it("starts with a distance and no start, also in the URL", async () => {
    await setup();
    expect(request()).toEqual({
      locations: [],
      costing: "bicycle",
      round_trip_options: { distance: 20000 },
      verbose: true,
      format: "osrm",
    });
    expect(
      JSON.parse(new URLSearchParams(location.search).get(URL_PARAM)!),
    ).toEqual(request());
    expect(
      screen.getByRole("spinbutton", { name: "round_trip_options.distance" }),
    ).toHaveValue(20000);
  });

  it("offers every costing but the multimodal ones", async () => {
    await setup();
    const offered = [
      ...document.querySelectorAll("#round-trip-costings option"),
    ].map((o) => o.getAttribute("value"));
    expect(offered).toContain("auto");
    expect(offered).toContain("pedestrian");
    for (const costing of ["multimodal", "bikeshare", "auto_pedestrian"])
      expect(offered).not.toContain(costing);
  });

  it("sends a clicked start to /round_trip and shows the result", async () => {
    const { fetch, sent } = serve();
    const { map } = await setup();
    click(map, START);

    expect(fetch).toHaveBeenCalledWith(
      "https://valhalla1.openstreetmap.de/round_trip",
      expect.anything(),
    );
    expect(sent()).toEqual([
      {
        locations: [{ lat: 52.517, lon: 13.3888 }],
        costing: "bicycle",
        round_trip_options: { distance: 20000 },
        verbose: true,
        format: "osrm",
      },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      /^1 round trip · \d+ ms$/,
    );
    expect(screen.getByText(/% of target$/)).toHaveTextContent(
      "-95.7 % of target",
    );
    expect(screen.getByRole("list", { name: "Steps" })).toBeInTheDocument();
    await waitFor(() =>
      expect(map.data("steps")?.features.length).toBeGreaterThan(0),
    );
    // three seed groups at the default heading tolerance of 45°
    expect(map.data("seed-area")!.features).toHaveLength(3);
    expect(map.data("heading")!.features).toHaveLength(1);
  });

  it("replaces the start instead of adding one, keeping its options", async () => {
    const { sent } = serve();
    const { user, map } = await setup();
    click(map, START);
    await screen.findByRole("status");
    await user.click(screen.getByText("Start options"));
    const radius = within(
      screen.getByText("Start options").closest("details")!,
    ).getByRole("spinbutton", { name: "radius" });
    await user.type(radius, "25{Enter}");
    click(map, new LngLat(13.4, 52.52));
    expect(request().locations).toEqual([
      { lat: 52.52, lon: 13.4, radius: 25 },
    ]);
    expect(sent().at(-1).locations).toEqual(request().locations);
  });

  it("sets the round trip options and drops emptied ones", async () => {
    serve();
    const { user, map } = await setup();
    click(map, START);
    await user.type(
      screen.getByRole("spinbutton", { name: "round_trip_options.heading" }),
      "90{Enter}",
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: "round_trip_options.heading_tolerance",
      }),
      "10{Enter}",
    );
    await user.type(
      screen.getByRole("spinbutton", {
        name: "round_trip_options.overlap_factor",
      }),
      "0{Enter}",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "alternates" }),
      "2{Enter}",
    );
    expect(request().round_trip_options).toEqual({
      distance: 20000,
      heading: 90,
      heading_tolerance: 10,
      overlap_factor: 0,
    });
    expect(request().alternates).toBe(2);
    // a single seed group below a tolerance of 15°
    expect(map.data("seed-area")!.features).toHaveLength(1);

    await user.clear(screen.getByRole("spinbutton", { name: "alternates" }));
    await user.tab();
    expect(request()).not.toHaveProperty("alternates");
  });

  it("shows the seeds of the round trip on show, without cost labels", async () => {
    const seeded = {
      ...route,
      routes: [
        {
          ...route.routes[0],
          round_trip_seeds: [
            { location: [13.39, 52.52], group: 1 },
            { location: [13.4, 52.51], group: 2 },
          ],
        },
      ],
    };
    serve(seeded);
    const { map } = await setup();
    click(map, START);
    const seeds = within(await screen.findByRole("list", { name: "Seeds" }));
    expect(seeds.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1group 113.390000,52.520000",
      "2group 213.400000,52.510000",
    ]);
    expect(screen.getAllByTitle(/^seed \d/).map((m) => m.textContent)).toEqual([
      "1",
      "2",
    ]);
    expect(screen.queryAllByTitle(/cost$/)).toHaveLength(0);
  });

  it("shows every seed candidate of a debug response, numbering the used ones", async () => {
    const seeded = {
      ...route,
      round_trip_seed_samples: [
        { location: [13.39, 52.52], group: 1 },
        { location: [13.38, 52.53], group: 1 },
        { location: [13.4, 52.51], group: 2 },
        { location: [13.41, 52.5], group: 2 },
      ],
      round_trip_seed_candidates: [
        {
          location: [13.39, 52.52],
          snapped_location: [13.391, 52.52],
          group: 1,
        },
        { location: [13.4, 52.51], snapped_location: [13.4, 52.511], group: 2 },
        { location: [13.41, 52.5], group: 2 },
      ],
      routes: [
        {
          ...route.routes[0],
          round_trip_seeds: [
            { location: [13.39, 52.52], group: 1 },
            { location: [13.41, 52.5], group: 2 },
          ],
        },
      ],
    };
    serve(seeded);
    const { map } = await setup();
    click(map, START);
    const seeds = within(await screen.findByRole("list", { name: "Seeds" }));
    expect(seeds.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "1group 1snap 68 m13.390000,52.520000",
      "–group 2snap 111 m13.400000,52.510000",
      "2group 213.410000,52.500000",
    ]);
    expect(
      screen.getByText("Seeds · 4 sampled · 3 candidates · 2 used"),
    ).toBeInTheDocument();
    expect(map.data("seed-candidates")!.features).toHaveLength(3);
    expect(map.data("seed-snaps")!.features).toHaveLength(2);
    expect(map.data("seed-snapped")!.features).toHaveLength(2);
    // the one sample that didn't become a candidate
    expect(map.data("seed-dropped")!.features).toHaveLength(1);
    expect(screen.getAllByTitle(/^seed \d/).map((m) => m.textContent)).toEqual([
      "1",
      "2",
    ]);
    // the seeds are drawn over the route
    const ids = map.layers.map((l) => l.id);
    expect(ids.indexOf("seed-candidates")).toBeGreaterThan(
      ids.indexOf("steps"),
    );
  });

  it("asks for verbose when the response has no seeds", async () => {
    serve();
    const { user, map } = await setup();
    await user.click(screen.getByRole("checkbox", { name: "verbose" }));
    click(map, START);
    expect(
      await screen.findByText(/^Send with verbose to see the seeds/),
    ).toBeInTheDocument();
    expect(request()).toHaveProperty("verbose", false);
  });

  it("links the current view on openstreetmap.org in a new tab", async () => {
    const { map } = await setup();
    const link = screen.getByRole("link", { name: "Open in OSM" });
    expect(link).toHaveAttribute("target", "_blank");
    act(() => {
      map.jumpTo({ center: [13.3888, 52.517], zoom: 12.6 });
      map.fire("moveend", {});
    });
    expect(link).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/#map=14/52.51700/13.38880",
    );
  });

  it("wiggles the start to get other seeds, keeping its options", async () => {
    const { sent } = serve();
    const { user, map } = await setup();
    const wiggle = screen.getByRole("button", { name: "Wiggle" });
    expect(wiggle).toBeDisabled();
    click(map, START);
    await screen.findByRole("status");
    await user.click(wiggle);
    const [moved] = request().locations;
    expect(Math.abs(moved.lon - 13.3888)).toBeGreaterThan(0);
    expect(Math.abs(moved.lon - 13.3888)).toBeLessThan(3e-6);
    expect(Math.abs(moved.lat - 52.517)).toBeGreaterThan(0);
    expect(Math.abs(moved.lat - 52.517)).toBeLessThan(3e-6);
    expect(sent().at(-1).locations).toEqual([moved]);
  });

  it("points the heading at a right-clicked spot", async () => {
    serve();
    const { user, map } = await setup();
    click(map, START);
    // due east of the start
    rightClick(map, new LngLat(13.5, 52.517));
    await user.click(screen.getByRole("menuitem", { name: /^Head this way/ }));
    expect(request().round_trip_options.heading).toBe(90);
  });

  it("shows server warnings and errors", async () => {
    serve({
      ...route,
      warnings: [
        {
          code: 304,
          text: "round trip distance exceeds maximum allowed value, clamping to 130000.0",
        },
      ],
    });
    const { map } = await setup();
    click(map, START);
    expect(
      await screen.findByRole("list", { name: "Warnings" }),
    ).toHaveTextContent("304 round trip distance exceeds");

    serve({ error_code: 178, error: "Insufficiently specified parameter" });
    click(map, START);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error 178: Insufficiently specified parameter",
    );
  });
});
