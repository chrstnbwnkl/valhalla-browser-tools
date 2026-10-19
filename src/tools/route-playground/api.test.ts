import { describe, expect, it, vi } from "vitest";
import {
  fetchRoute,
  mapMatch,
  toFilters,
  traceLegs,
  traceRequest,
} from "./api";
import mapMatched from "./fixtures/map-match.json";
import route from "./fixtures/route.json";
import leg0 from "./fixtures/trace-leg0.json";

const SERVER = "http://valhalla.test";
const signal = new AbortController().signal;
/** Answers requests with `bodies` in turn, recording them. */
function serve(...bodies: unknown[]) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({
    json: async () => bodies.shift(),
  }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const bodyOf = (call: unknown[]) =>
  JSON.parse((call[1] as RequestInit).body as string);

describe("toFilters", () => {
  it("takes the filter with or without its key", () => {
    const filters = { attributes: ["edge.names"], action: "include" };
    expect(toFilters({ filters })).toEqual(filters);
    expect(toFilters(filters)).toEqual(filters);
  });

  it("says what is wrong with anything else", () => {
    expect(() => toFilters({ attributes: [1], action: "include" })).toThrow(
      /attributes/,
    );
    expect(() => toFilters({ attributes: [], action: "keep" })).toThrow(
      /action/,
    );
  });
});

describe("traceRequest", () => {
  const coords = [
    [13.1, 52.1],
    [13.2, 52.2],
  ];
  const sent = {
    costing: "auto",
    costing_options: { auto: {} },
    locations: [],
  };

  it("traces with what the route was requested with", () => {
    const trace = traceRequest(coords, "edge_walk", sent, null);
    expect(trace).toMatchObject({
      shape_match: "edge_walk",
      costing: "auto",
      costing_options: { auto: {} },
    });
    expect(trace).not.toHaveProperty("locations");
    expect(trace).not.toHaveProperty("filters");
  });

  it("never filters out what the edges are drawn with", () => {
    const included = traceRequest(coords, "edge_walk", sent, {
      attributes: ["edge.names", "shape"],
      action: "include",
    });
    expect(included.filters).toEqual({
      attributes: [
        "shape",
        "edge.begin_shape_index",
        "edge.end_shape_index",
        "edge.names",
      ],
      action: "include",
    });
    const excluded = traceRequest(coords, "edge_walk", sent, {
      attributes: ["shape", "edge.speed"],
      action: "exclude",
    });
    expect(excluded.filters).toEqual({
      attributes: ["edge.speed"],
      action: "exclude",
    });
  });
});

describe("fetchRoute", () => {
  it("returns the routes", async () => {
    serve(route);
    expect((await fetchRoute(SERVER, {}, signal)).routes).toHaveLength(1);
  });

  it.each([
    [
      { error_code: 171, error: "No suitable edges" },
      "Error 171: No suitable edges",
    ],
    [
      { code: "NoRoute", message: "Impossible route" },
      "NoRoute: Impossible route",
    ],
    [{ routes: [] }, "No routes in the response."],
  ])("explains %j", async (body, message) => {
    serve(body);
    await expect(fetchRoute(SERVER, {}, signal)).rejects.toThrow(message);
  });

  it("says when the server can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(fetchRoute(SERVER, {}, signal)).rejects.toThrow(
      `Request to ${SERVER} failed: Failed to fetch`,
    );
  });
});

describe("traceLegs", () => {
  const shapes = [
    [
      [13.1, 52.1],
      [13.2, 52.2],
    ],
  ];

  it("edge walks each leg, map matching where that fails", async () => {
    const fetch = serve(
      { error_code: 443, error: "Exact route match algorithm failed" },
      leg0,
    );
    const [leg] = await traceLegs(
      SERVER,
      shapes,
      { costing: "auto" },
      null,
      signal,
    );
    expect(leg!.snapped).toBe(true);
    expect(fetch.mock.calls.map((call) => bodyOf(call).shape_match)).toEqual([
      "edge_walk",
      "map_snap",
    ]);
  });

  it("fails when neither finds edges", async () => {
    serve(
      { error_code: 443, error: "failed" },
      { error_code: 444, error: "no match" },
    );
    await expect(traceLegs(SERVER, shapes, {}, null, signal)).rejects.toThrow(
      "error 444: no match",
    );
  });
});

describe("mapMatch", () => {
  it("returns the shape under the line", async () => {
    serve(mapMatched);
    expect(await mapMatch(SERVER, [[13.39, 52.516]], { costing: "auto" })).toBe(
      mapMatched.shape,
    );
  });

  it("explains a failure", async () => {
    serve({ error_code: 442, error: "No data found for location" });
    await expect(mapMatch(SERVER, [], {})).rejects.toThrow(
      "Could not map match the line: error 442: No data found for location",
    );
  });
});
