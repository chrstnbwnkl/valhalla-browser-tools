import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MapProvider } from "../../shared/map/context";
import { Map as FakeMap, LngLat } from "../../test/maplibre";
import valhalla from "../route-comparison/fixtures/valhalla.json";
import route from "../route-playground/fixtures/route.json";
import leg0 from "../route-playground/fixtures/trace-leg0.json";
import leg1 from "../route-playground/fixtures/trace-leg1.json";
import { App, HISTOGRAMS_KEY } from "./App";

type Answer = (body: Record<string, unknown>) => unknown;

/** Answers trace_attributes from the recorded legs, recording the requests. */
function serve(
  trace: Answer = (() => {
    let legs = 0;
    return () => [leg0, leg1][legs++ % 2];
  })(),
) {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => ({
    json: async () => trace(JSON.parse(init.body as string)),
  }));
  vi.stubGlobal("fetch", fetch);
  const sent = () =>
    fetch.mock.calls.map(([url, init]) => ({
      url,
      body: JSON.parse(init.body as string),
    }));
  return { sent };
}

async function setup() {
  const user = userEvent.setup();
  render(
    <MapProvider>
      <App />
    </MapProvider>,
  );
  // loaded once the layers under the pointer are listened to
  await waitFor(() =>
    expect(
      FakeMap.instances.at(-1)!.listeners.some((l) => l.layer === "edges"),
    ).toBe(true),
  );
  return { user, map: FakeMap.instances.at(-1)! };
}

async function paste(user: ReturnType<typeof userEvent.setup>, data: unknown) {
  await user.click(screen.getByRole("textbox", { name: "Response" }));
  await user.paste(JSON.stringify(data));
  await user.click(screen.getByRole("button", { name: "Trace" }));
}

describe("route attributes", () => {
  it("traces each leg of a pasted OSRM-format response and shows its edges", async () => {
    const { sent } = serve();
    const { user, map } = await setup();
    await paste(user, route);
    const edges = within(await screen.findByRole("list", { name: "Edges" }));

    const traces = sent();
    expect(traces.map((t) => t.url)).toEqual([
      expect.stringMatching(/\/trace_attributes$/),
      expect.stringMatching(/\/trace_attributes$/),
    ]);
    expect(traces[0]!.body).toMatchObject({
      costing: "auto",
      shape_match: "edge_walk",
    });
    expect(edges.getAllByText(/^#\d+/)).toHaveLength(
      leg0.edges.length + leg1.edges.length,
    );
    expect(edges.getByText(/^Leg 1 · 25 edges/)).toBeInTheDocument();
    expect(screen.getByText("edges").nextSibling).toHaveTextContent("48");
    expect(screen.getByRole("status")).toHaveTextContent("2 legs traced");
    expect(map.data("edges")!.features.length).toBeGreaterThan(40);
    expect(map.data("route")!.features).toHaveLength(1);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Edge theme" }),
      "road_class",
    );
    expect(
      within(screen.getByLabelText("Legend")).getByText(
        String(leg0.edges[0]!.road_class),
      ),
    ).toBeInTheDocument();
  });

  it("traces a Valhalla-format response with the costing of the pasted request", async () => {
    const { sent } = serve(() => leg0);
    const { user } = await setup();
    const request = screen.getByRole("textbox", { name: "Request" });
    await user.clear(request);
    await user.click(request);
    await user.paste(
      JSON.stringify({
        locations: [],
        costing: "bicycle",
        costing_options: { bicycle: { use_roads: 0.2 } },
        alternates: 2,
      }),
    );
    await paste(user, valhalla);
    await screen.findByRole("list", { name: "Edges" });

    expect(sent()).toHaveLength(valhalla.trip.legs.length);
    const body = sent()[0]!.body;
    expect(body).toMatchObject({
      costing: "bicycle",
      costing_options: { bicycle: { use_roads: 0.2 } },
      encoded_polyline: expect.any(String),
    });
    expect(body).not.toHaveProperty("alternates");
  });

  it("says what is wrong with what was pasted", async () => {
    serve();
    const { user } = await setup();
    await paste(user, { error_code: 171, error: "No suitable edges" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That is an error response",
    );
  });

  it("map matches a leg whose edge walk fails, and says so", async () => {
    let calls = 0;
    serve((body) =>
      body.shape_match === "edge_walk"
        ? calls++ === 0
          ? { error_code: 443, error: "Exact route match algorithm failed" }
          : leg1
        : leg0,
    );
    const { user } = await setup();
    await paste(user, route);
    await screen.findByRole("list", { name: "Edges" });
    expect(screen.getByText("map-matched")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "edge_walk failed for leg 0",
    );
  });

  it("inspects an edge clicked on the map", async () => {
    serve();
    const { user, map } = await setup();
    await paste(user, route);
    await screen.findByRole("list", { name: "Edges" });
    vi.spyOn(map, "queryRenderedFeatures").mockImplementation(
      (_point, options) =>
        options?.layers?.includes("edges")
          ? [
              {
                layer: { id: "edges" },
                properties: { idx: 0 },
                geometry: { type: "LineString", coordinates: [] },
              },
            ]
          : [],
    );
    const at = new LngLat(13.39, 52.51);
    act(() =>
      map.fire("click", {
        lngLat: at,
        point: { x: 0, y: 0 },
        originalEvent: { target: map.getCanvas() },
      }),
    );
    const popup = await screen.findByRole("dialog", { name: "edge 0" });
    expect(popup).toHaveTextContent(
      `road_class: ${JSON.stringify(leg0.edges[0]!.road_class)}`,
    );
    expect(popup).not.toHaveTextContent("end_node");
  });

  it("plots numeric attributes as histograms of the distance, with its weighted mean", async () => {
    serve();
    const { user, map } = await setup();
    await paste(user, route);
    await screen.findByRole("list", { name: "Edges" });
    await user.click(screen.getByRole("radio", { name: "Histograms" }));

    // density to start with: every edge of the recorded legs has 10
    const density = within(
      screen.getByRole("region", { name: "Histogram of density" }),
    );
    expect(
      density.getByText("distance-weighted mean").nextSibling,
    ).toHaveTextContent("10");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Add a histogram" }),
      "speed",
    );
    const speed = within(
      screen.getByRole("region", { name: "Histogram of speed" }),
    );
    const edges = [...leg0.edges, ...leg1.edges];
    const length = edges.reduce((sum, e) => sum + e.length, 0);
    const mean = edges.reduce((sum, e) => sum + e.speed * e.length, 0) / length;
    expect(
      speed.getByText("distance-weighted mean").nextSibling,
    ).toHaveTextContent(String(+mean.toFixed(3)));
    expect(JSON.parse(localStorage.getItem(HISTOGRAMS_KEY)!)).toEqual([
      "density",
      "speed",
    ]);

    // the edges of the bin under the pointer show on the map
    await user.hover(density.getAllByTestId("bin")[0]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      `${edges.length} edges`,
    );
    expect(map.getLayer("bin-edges")!.filter).toEqual([
      "in",
      ["get", "idx"],
      ["literal", edges.map((_, i) => i)],
    ]);

    await user.click(
      screen.getByRole("button", { name: "Remove the histogram of density" }),
    );
    expect(
      screen.queryByRole("region", { name: "Histogram of density" }),
    ).not.toBeInTheDocument();
  });
});
