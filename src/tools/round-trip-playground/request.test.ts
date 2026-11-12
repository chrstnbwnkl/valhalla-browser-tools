import { describe, expect, it } from "vitest";
import {
  bearing,
  destination,
  effectiveOptions,
  fieldOf,
  sectorRing,
  seedArea,
  wiggled,
  withField,
} from "./request";

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

  it("applies the server's defaults, wrapping and clamping", () => {
    expect(effectiveOptions({})).toBeNull();
    expect(
      effectiveOptions({ round_trip_options: { distance: 0 } }),
    ).toBeNull();
    expect(
      effectiveOptions({ round_trip_options: { distance: 1000 } }),
    ).toEqual({ distance: 1000, heading: 0, headingTolerance: 45 });
    expect(
      effectiveOptions({
        round_trip_options: {
          distance: 1000,
          heading: -90,
          heading_tolerance: 500,
        },
      }),
    ).toEqual({ distance: 1000, heading: 270, headingTolerance: 180 });
    expect(
      effectiveOptions({
        round_trip_options: { distance: 1000, heading_tolerance: 1 },
      })?.headingTolerance,
    ).toBe(10);
  });

  it("estimates the seed radius as the server does", () => {
    // a single group: out and back, twice the radius on the network
    const narrow = seedArea(12000, 10);
    expect(narrow.groups).toBe(1);
    expect(narrow.inner).toBeCloseTo(3000);
    expect(narrow.outer).toBeCloseTo(5000);
    expect(seedArea(14000, 30).groups).toBe(2);
    expect(seedArea(14000, 45).groups).toBe(3);
  });

  it("measures bearings and destinations", () => {
    const start = [13.4, 52.5];
    const east = destination(start, 90, 1000);
    expect(bearing(start, east)).toBeCloseTo(90, 1);
    expect(bearing(start, destination(start, 225, 1000))).toBeCloseTo(225, 1);
    expect(east[1]).toBeCloseTo(52.5, 3);
  });

  it("closes the sector ring", () => {
    const ring = sectorRing([0, 0], 100, 200, -45, 45);
    expect(ring[0]).toEqual(ring.at(-1));
    expect(ring.length).toBeGreaterThan(4);
  });

  it("wiggles the start by a millionth or two of a degree", () => {
    expect(wiggled([13.4, 52.5], () => 0)).toEqual([13.399998, 52.499998]);
    expect(wiggled([13.4, 52.5], () => 0.99)).toEqual([13.400002, 52.500002]);
    for (let i = 0; i < 50; i++) {
      const [lon = 0, lat = 0] = wiggled([13.4, 52.5]);
      const dLon = Math.round(Math.abs(lon - 13.4) * 1e6);
      const dLat = Math.round(Math.abs(lat - 52.5) * 1e6);
      expect([1, 2]).toContain(dLon);
      expect([1, 2]).toContain(dLat);
    }
  });
});
