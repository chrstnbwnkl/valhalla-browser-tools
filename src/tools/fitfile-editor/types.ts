import { CoursePointType, Sport } from "../../shared/fit";
import { isObject } from "../../shared/valhalla/request";

const words = (name: string) =>
  name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^U Turn$/, "U-turn");

/** Every course point type with a label, in the profile's order. */
export const TYPE_OPTIONS = Object.entries(CoursePointType).map(
  ([name, value]) => ({ value, label: words(name) }),
);
export const typeLabel = (type: number) =>
  TYPE_OPTIONS.find((o) => o.value === type)?.label ?? `type ${type}`;

export const SPORT_OPTIONS = Object.entries(Sport).map(([name, value]) => ({
  value,
  label: words(name),
}));

const GLYPHS: Partial<Record<number, string>> = {
  [CoursePointType.Left]: "←",
  [CoursePointType.Right]: "→",
  [CoursePointType.SlightLeft]: "↖",
  [CoursePointType.SlightRight]: "↗",
  [CoursePointType.SharpLeft]: "↙",
  [CoursePointType.SharpRight]: "↘",
  [CoursePointType.Straight]: "↑",
  [CoursePointType.UTurn]: "↶",
  [CoursePointType.LeftFork]: "⑂",
  [CoursePointType.RightFork]: "⑂",
  [CoursePointType.MiddleFork]: "⑂",
  [CoursePointType.SegmentStart]: "▶",
  [CoursePointType.SegmentEnd]: "■",
  [CoursePointType.Summit]: "▲",
  [CoursePointType.Valley]: "▼",
  [CoursePointType.FourthCategory]: "4",
  [CoursePointType.ThirdCategory]: "3",
  [CoursePointType.SecondCategory]: "2",
  [CoursePointType.FirstCategory]: "1",
  [CoursePointType.HorsCategory]: "HC",
  [CoursePointType.Tunnel]: "∩",
  [CoursePointType.Bridge]: "≍",
  [CoursePointType.Obstacle]: "!",
  [CoursePointType.Alert]: "!",
  [CoursePointType.Danger]: "!",
  [CoursePointType.SteepIncline]: "◢",
  [CoursePointType.Transport]: "⛴",
  [CoursePointType.MileMarker]: "#",
  [CoursePointType.Water]: "💧",
  [CoursePointType.Food]: "🍴",
  [CoursePointType.Info]: "i",
};
export const glyphOf = (type: number) => GLYPHS[type] ?? "•";

export type ElevationSource = "valhalla" | "mapterhorn";

export type Settings = {
  elevation: ElevationSource;
  /** Zoom of the Mapterhorn tiles asked for first. */
  zoom: number;
  /** Most meters between records. */
  spacing: number;
  /** Take bridges and tunnels straight from end to end. */
  flatten: boolean;
  /** Meters a turn is announced early by. */
  alertOffset: number;
  /** Percent from which an edge counts as steep. */
  steepGrade: number;
  /** Kilometers between distance markers; 0 for none. */
  markerEvery: number;
  /** Meters a summit has to stand above the valleys either side of it. */
  prominence: number;
};

export const SETTINGS_KEY = "valhalla-browser-tools:fitfile-editor-settings";
export const DEFAULT_SETTINGS: Settings = {
  elevation: "valhalla",
  zoom: 16,
  spacing: 25,
  flatten: true,
  alertOffset: 100,
  steepGrade: 10,
  markerEvery: 10,
  prominence: 30,
};

export function parseSettings(raw: unknown): Settings {
  if (!isObject(raw)) return DEFAULT_SETTINGS;
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[])
    if (typeof raw[key] === typeof DEFAULT_SETTINGS[key])
      (out as Record<string, unknown>)[key] = raw[key];
  if (out.elevation !== "valhalla" && out.elevation !== "mapterhorn")
    out.elevation = DEFAULT_SETTINGS.elevation;
  return out;
}

/** Bytes of UTF-8 the course point name field holds. */
export const NAME_BYTES = 15;
export const byteLength = (text: string) =>
  new TextEncoder().encode(text).length;
