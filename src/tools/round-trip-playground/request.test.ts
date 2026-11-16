import { describe, expect, it } from "vitest";
import { bearing, fieldOf, seedsOf, withField } from "./request";

describe("round trip request", () => {
  it("sets and removes fields, dropping round_trip_options once empty", () => {
    let req = withField({}, "round_trip_options.distance", 5000);
    req = withField(req, "alternates", 1);
    expect(req).toEqual({
      round_trip_options: { distance: 5000 },
      alternates: 1,
    });
    expect(fieldOf(req, "round_trip_options.distance")).toBe(5000);
    expect(fieldOf(req, "alternates")).toBe(1);
    req = withField(req, "round_trip_options.distance", undefined);
    req = withField(req, "alternates", undefined);
    expect(req).toEqual({});
  });

  it("measures bearings", () => {
    expect(bearing([13.4, 52.5], [13.5, 52.5])).toBeCloseTo(90, 0);
    expect(bearing([13.4, 52.5], [13.4, 52.4])).toBeCloseTo(180, 5);
  });

  it("reads the turning points, group 2 being the used ones", () => {
    expect(seedsOf({})).toEqual([]);
    expect(
      seedsOf({
        round_trip_seeds: [
          { location: [1, 2], group: 1 },
          { location: [3, 4], group: 2 },
          { location: "bad", group: 2 },
        ],
      }),
    ).toEqual([
      { location: [1, 2], used: false },
      { location: [3, 4], used: true },
    ]);
  });
});
