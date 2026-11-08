import { describe, expect, it } from "vitest";
import { CoursePointType, type FitRecord } from "../../shared/fit";
import type { EditorPoint } from "../../shared/fitDraft";
import type { Span } from "./spans";
import {
  climbCategory,
  distanceMarkers,
  edgeSuggestions,
  elevationSuggestions,
  extremes,
  suggest,
  turnAlerts,
} from "./suggestions";
import { DEFAULT_SETTINGS } from "./types";

/** A straight track east along the equator, a record every 10 m. */
const track = (meters: number): FitRecord[] =>
  Array.from({ length: meters / 10 + 1 }, (_, i) => ({
    lon: (i * 10) / 111195,
    lat: 0,
    distance: i * 10,
    time: i,
  }));

const span = (
  from: number,
  to: number,
  edge: Span["edge"] = {},
  node = {},
) => ({
  from,
  to,
  edge,
  node,
});

const turn = (id: string, distance: number): EditorPoint => ({
  id,
  lon: distance / 111195,
  lat: 0,
  distance,
  type: CoursePointType.Left,
  name: "Main",
});

describe("turnAlerts", () => {
  it("moves turns back by the offset, and leaves other points be", () => {
    const records = track(1000);
    const points = [
      turn("a", 500),
      turn("b", 50),
      { ...turn("c", 700), type: CoursePointType.Summit },
    ];
    const out = turnAlerts(points, records, 100);
    expect(out).toHaveLength(1);
    expect(out[0]!.replaces).toBe("a");
    expect(out[0]!.point.distance).toBeCloseTo(400, 6);
  });
});

describe("edgeSuggestions", () => {
  const records = track(2000);

  it("marks tunnels, long bridges, steps, barriers, unpaved and steep stretches", () => {
    const spans = [
      span(0, 100, { tunnel: true, names: ["Tiergartentunnel"] }),
      span(100, 200, { tunnel: true }),
      span(200, 210, { bridge: true }),
      span(210, 300),
      span(300, 360, { bridge: true }),
      span(360, 380, { use: "steps" }),
      span(380, 400, {}, { type: "gate" }),
      span(400, 420, {}, { type: "border_control" }),
      span(420, 600, { unpaved: true }),
      span(600, 700, { max_upward_grade: 12 }),
      span(700, 800, { max_upward_grade: 14 }),
      span(800, 900, { max_upward_grade: 4, curvature: 15 }),
    ];
    const out = edgeSuggestions(spans, records, 10);
    expect(
      out.map((s) => [s.kind, s.point.type, s.point.name, s.point.distance]),
    ).toEqual([
      ["tunnel", CoursePointType.Tunnel, "Tiergartentunnel", 0],
      ["bridge", CoursePointType.Bridge, "Bridge", 300],
      ["obstacle", CoursePointType.Obstacle, "Steps", 360],
      ["obstacle", CoursePointType.Obstacle, "Gate", 400],
      ["unpaved", CoursePointType.Alert, "Unpaved", 420],
      ["steep", CoursePointType.SteepIncline, "14% climb", 600],
    ]);
  });
});

describe("elevation", () => {
  it("finds the alternating lows and highs that stand out", () => {
    const alt = [100, 105, 102, 160, 150, 155, 90, 95, 200];
    expect(extremes(alt, 30)).toEqual([
      { kind: "low", i: 0 },
      { kind: "high", i: 3 },
      { kind: "low", i: 6 },
      { kind: "high", i: 8, last: true },
    ]);
  });

  it("categorizes climbs by length times grade", () => {
    expect(climbCategory(1000, 20)).toBeNull(); // 2%
    expect(climbCategory(2000, 100)).toBe(CoursePointType.FourthCategory);
    expect(climbCategory(5000, 200)).toBe(CoursePointType.ThirdCategory);
    expect(climbCategory(10000, 900)).toBe(CoursePointType.HorsCategory);
  });

  it("suggests the climbs, summits and valleys of a profile", () => {
    const records = track(6000);
    // 2 km up 120 m, 2 km down 100 m, 2 km flat
    const alt = records.map(({ distance: d }) =>
      d <= 2000 ? 100 + d * 0.06 : d <= 4000 ? 220 - (d - 2000) * 0.05 : 120,
    );
    const out = elevationSuggestions(records, alt, 30);
    expect(out.map((s) => [s.kind, s.point.type, s.point.distance])).toEqual([
      ["climb", CoursePointType.FourthCategory, 0],
      ["summit", CoursePointType.Summit, 2000],
    ]);
    expect(out[0]!.point.name).toBe("2.0km 6% 120m");
  });
});

it("places distance markers short of the end", () => {
  expect(distanceMarkers(track(25000), 10).map((s) => s.point.name)).toEqual([
    "10 km",
    "20 km",
  ]);
  expect(distanceMarkers(track(25000), 0)).toEqual([]);
});

describe("suggest", () => {
  const records = track(25000);
  const base = {
    records,
    altitudes: null,
    spans: null,
    settings: { ...DEFAULT_SETTINGS, alertOffset: 0 },
  };

  it("leaves out what was dismissed or is already a point", () => {
    const all = suggest({ ...base, points: [], dismissed: [] });
    expect(all.map((s) => s.id)).toEqual(["marker:10", "marker:20"]);
    const marker = { ...all[0]!.point, id: "m" };
    expect(
      suggest({ ...base, points: [marker], dismissed: ["marker:20"] }),
    ).toEqual([]);
  });
});
