import { describe, expect, it } from "vitest";
import { encodePolyline } from "../../shared/map/geo";
import route from "./fixtures/route.json";
import {
  flattenSteps,
  legShapes,
  routeCoords,
  toCoords,
  type RouteResponse,
} from "./routes";

const { routes, waypoints } = route as RouteResponse;
const selected = routes[0]!;

describe("toCoords", () => {
  const coords = [
    [13.4, 52.5],
    [13.41, 52.51],
  ];

  it("guesses the precision of an encoded line from a known position", () => {
    expect(toCoords(encodePolyline(coords, 6), [13.4, 52.5])).toEqual(coords);
    expect(toCoords(encodePolyline(coords, 5), [13.4, 52.5])).toEqual(coords);
  });

  it("takes GeoJSON as it is", () => {
    expect(toCoords({ coordinates: coords })).toEqual(coords);
    expect(toCoords(undefined)).toEqual([]);
  });
});

describe("steps", () => {
  it("numbers the steps across legs", () => {
    const steps = flattenSteps(selected);
    expect(steps).toHaveLength(12);
    expect(steps.map((s) => s.legIdx)).toEqual([
      0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1,
    ]);
    expect(steps.map((s) => s.idx)).toEqual([...steps.keys()]);
    // positions near the route, not mis-decoded
    expect(steps[0]!.coords[0]![1]).toBeCloseTo(52.517, 2);
  });

  it("puts each leg's shape together without repeating the points steps share", () => {
    const shapes = legShapes(selected);
    expect(shapes).toHaveLength(2);
    for (const shape of shapes)
      for (const [i, c] of shape.entries())
        if (i) expect(c).not.toEqual(shape[i - 1]);
    expect(
      routeCoords(selected, waypoints?.[0]?.location).length,
    ).toBeGreaterThan(1);
  });
});
