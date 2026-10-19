import { describe, expect, it } from "vitest";
import osrm from "./fixtures/osrm.json";
import valhalla from "./fixtures/valhalla.json";
import { parseResponse } from "./response";

describe("parseResponse", () => {
  it("reads an OSRM response with its alternative, weights and turn weights", () => {
    const response = parseResponse(osrm);
    expect(response.format).toBe("osrm");
    expect(response.routes).toHaveLength(2);
    const [best] = response.routes;
    expect(best!.cost).toBe(osrm.routes[0]!.weight);
    expect(best!.costName).toBe("weight (auto)");
    expect(best!.distanceUnit).toBe("m");
    const steps = osrm.routes[0]!.legs[0]!.steps;
    expect(best!.segments).toHaveLength(steps.length);
    expect(best!.segments[1]).toMatchObject({
      cost: steps[1]!.weight,
      title: steps[1]!.maneuver.instruction,
      arrival: false,
    });
    expect(best!.segments.at(-1)!.arrival).toBe(true);
    expect(
      best!.segments.some((s) => s.intersections.some((i) => i.turnCost > 0)),
    ).toBe(true);
    // the geometry is drawn, not listed
    expect(best!.segments[1]!.raw).not.toHaveProperty("geometry");
    expect(response.waypoints).toHaveLength(2);
  });

  it("reads a Valhalla response with its alternate and maneuver costs", () => {
    const response = parseResponse(valhalla);
    expect(response.format).toBe("valhalla");
    expect(response.routes).toHaveLength(2);
    const [best] = response.routes;
    expect(best!.cost).toBe(valhalla.trip.summary.cost);
    expect(best!.distanceUnit).toBe("km");
    const maneuvers = valhalla.trip.legs[0]!.maneuvers;
    expect(best!.segments).toHaveLength(maneuvers.length);
    expect(best!.segments[1]!.cost).toBe(maneuvers[1]!.cost);
    expect(best!.segments[1]!.coords).toHaveLength(
      maneuvers[1]!.end_shape_index - maneuvers[1]!.begin_shape_index + 1,
    );
    expect(best!.segments.at(-1)!.arrival).toBe(true);
    // same route, same cost, whichever the format
    expect(best!.cost).toBeCloseTo(parseResponse(osrm).routes[0]!.cost!, 3);
    expect(response.waypoints[0]!.at).toEqual([13.4132, 52.5219]);
  });

  it.each([
    [[], "A response is a JSON object."],
    [
      { error_code: 171, error: "No suitable edges" },
      "That is an error response: 171: No suitable edges",
    ],
    [
      { code: "NoRoute", message: "Impossible route" },
      "That is an error response: Impossible route",
    ],
    [{ routes: [] }, "That is not a /route response"],
  ])("rejects %j", (data, message) => {
    expect(() => parseResponse(data)).toThrow(message);
  });
});
