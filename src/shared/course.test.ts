import { describe, expect, it } from "vitest";
import { CoursePointType, crc, encodeCourse } from "./fit";
import type { RouteResponse } from "./valhalla/osrm";
import {
  climb,
  coursePointOf,
  pointAt,
  routeTrack,
  snapToTrack,
  sportOf,
} from "./course";
import fixture from "../tools/route-playground/fixtures/route.json";

const route = (fixture as RouteResponse).routes[0]!;

describe("routeTrack", () => {
  const { records, coursePoints } = routeTrack(route);

  it("runs distance and time up to the route's", () => {
    for (let i = 1; i < records.length; i++) {
      expect(records[i]!.distance).toBeGreaterThan(records[i - 1]!.distance);
      expect(records[i]!.time).toBeGreaterThanOrEqual(records[i - 1]!.time);
    }
    const last = records.at(-1)!;
    expect(last.time).toBeCloseTo(route.duration!, 2);
    expect(last.distance / route.distance!).toBeCloseTo(1, 1);
  });

  it("spaces records no further than 50 m", () => {
    for (let i = 1; i < records.length; i++)
      expect(records[i]!.distance - records[i - 1]!.distance).toBeLessThan(
        50.001,
      );
  });

  it("marks every maneuver and the ends of both legs", () => {
    expect(coursePoints.map((p) => [p.type, p.name])).toEqual([
      [CoursePointType.SegmentStart, "Leg 1 start"],
      [CoursePointType.Left, expect.any(String)],
      [CoursePointType.Left, expect.any(String)],
      [CoursePointType.Right, expect.any(String)],
      [CoursePointType.SegmentEnd, "Leg 1 end"],
      [CoursePointType.SegmentStart, "Leg 2 start"],
      [CoursePointType.Left, expect.any(String)],
      [CoursePointType.Left, expect.any(String)],
      [CoursePointType.Right, expect.any(String)],
      [CoursePointType.Left, expect.any(String)],
      [CoursePointType.Left, expect.any(String)],
      [CoursePointType.SegmentEnd, "Leg 2 end"],
    ]);
    expect(coursePoints[1]!.name).toBe("Behrenstraße");
    const distances = coursePoints.map((p) => p.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });
});

describe("coursePointOf", () => {
  const step = (type: string, modifier?: string, extra = {}) => ({
    name: "Main",
    maneuver: { type, modifier, ...extra },
  });

  it("leaves out depart and arrive in a single leg", () => {
    expect(coursePointOf(step("depart"), undefined, 0, 1)).toBeNull();
    expect(coursePointOf(step("arrive"), undefined, 0, 1)).toBeNull();
  });

  it("tells forks, roundabouts and ferries apart", () => {
    expect(coursePointOf(step("fork", "slight left"), undefined, 0, 1)).toEqual(
      { type: CoursePointType.LeftFork, name: "Main" },
    );
    expect(
      coursePointOf(step("roundabout", "right", { exit: 2 }), undefined, 0, 1),
    ).toEqual({ type: CoursePointType.Right, name: "Exit 2 Main" });
    expect(
      coursePointOf(step("exit roundabout", "right"), undefined, 0, 1),
    ).toBeNull();
    const ferry = { ...step("turn", "left"), mode: "ferry" };
    expect(coursePointOf(ferry, step("turn"), 0, 1)?.type).toBe(
      CoursePointType.Transport,
    );
    expect(coursePointOf(ferry, ferry, 0, 1)?.type).toBe(CoursePointType.Left);
  });
});

it("sums climbs and drops", () => {
  expect(climb([100, 110, 105, 120])).toEqual({ ascent: 25, descent: 5 });
});

it("maps costings to sports", () => {
  expect(sportOf("bicycle")).toBe(2);
  expect(sportOf("auto")).toBe(24);
  expect(sportOf("multimodal")).toBe(0);
});

describe("encodeCourse", () => {
  const { records, coursePoints } = routeTrack(route);
  const bytes = encodeCourse({
    name: "test",
    sport: 2,
    start: new Date("2026-01-01T00:00:00Z"),
    records: records.map((r) => ({ ...r, altitude: 34 })),
    coursePoints,
    ascent: 0,
    descent: 0,
  });

  it("writes a header and CRCs a reader checks", () => {
    const view = new DataView(bytes.buffer);
    expect(bytes[0]).toBe(14);
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe(".FIT");
    expect(view.getUint32(4, true)).toBe(bytes.length - 16);
    // a CRC over data and its own CRC comes to zero
    expect(crc(bytes, 0, 14)).toBe(0);
    expect(crc(bytes, 14)).toBe(0);
  });
});

describe("track lookups", () => {
  const { records } = routeTrack(route);
  const total = records.at(-1)!.distance;

  it("interpolates position and time at a distance", () => {
    const mid = pointAt(records, total / 2)!;
    expect(mid.distance).toBeCloseTo(total / 2, 6);
    expect(mid.time).toBeGreaterThan(0);
    expect(mid.time).toBeLessThan(route.duration!);
    expect(pointAt(records, total * 2)!.distance).toBe(total);
  });

  it("snaps a position beside the track onto it", () => {
    const on = pointAt(records, 300)!;
    // a few meters off the line
    const snapped = snapToTrack(records, [on.lon + 0.00003, on.lat + 0.00003])!;
    expect(Math.abs(snapped.distance - 300)).toBeLessThan(10);
  });

  it("looks only from `after` on where asked", () => {
    const early = pointAt(records, 50)!;
    const snapped = snapToTrack(records, [early.lon, early.lat], 400, 100)!;
    expect(snapped.distance).toBeGreaterThanOrEqual(400);
  });

  it("densifies to the spacing asked for", () => {
    const fine = routeTrack(route, undefined, 10).records;
    expect(fine.length).toBeGreaterThan(records.length);
    for (let i = 1; i < fine.length; i++)
      expect(fine[i]!.distance - fine[i - 1]!.distance).toBeLessThan(10.001);
    expect(fine.at(-1)!.distance).toBeCloseTo(total, 3);
  });
});

it("leaves out climbs and drops under the threshold", () => {
  expect(climb([100, 101, 100, 102, 99, 100], 3)).toEqual({
    ascent: 0,
    descent: 0,
  });
  expect(climb([100, 101, 100, 102, 99, 100], 0).ascent).toBe(4);
});
