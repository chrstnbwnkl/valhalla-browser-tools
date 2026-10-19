import type { ThemeColors } from "../../shared/theme/colors";
import type { RouteEdge } from "./edges";
import { fmtValue } from "../../shared/format";

// Categorical values get the data series in order of frequency, the rest is
// "other". Numbers get a ramp, one hue for edges and another for nodes.
const CATEGORICAL = ["green", "magenta", "ink", "blue", "amber"] as const;
const EDGE_RAMP = ["green-soft", "green", "green-ink"] as const;
const NODE_RAMP = ["magenta-soft", "magenta", "magenta-ink"] as const;
const HIDDEN_KEYS = new Set(["begin_shape_index", "end_shape_index"]);
// numeric, but identifiers rather than quantities
const ID_KEY = /(^|_)id$/;

/**
 * The value an attribute is themed by: lists of primitives and flat objects
 * are joined, lists of objects counted; deeper objects can't be themed.
 */
export function scalar(value: unknown): string | number | boolean | undefined {
  const flat = (values: unknown[]) =>
    values.every((v) => typeof v !== "object");
  if (Array.isArray(value))
    return flat(value) ? value.join(" / ") : value.length;
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return value as string | number | boolean;
  const values = Object.values(value);
  return flat(values) ? values.join(" / ") : undefined;
}

export function themeKeys(objects: (object | undefined)[]) {
  const keys = new Set<string>();
  for (const object of objects) {
    for (const [key, value] of Object.entries(object ?? {})) {
      if (!HIDDEN_KEYS.has(key) && scalar(value) !== undefined) keys.add(key);
    }
  }
  return [...keys].sort();
}

function rampColor(ramp: string[], t: number) {
  const pos = Math.min(Math.max(t, 0), 1) * (ramp.length - 1);
  const i = Math.min(Math.floor(pos), ramp.length - 2);
  const [a, b] = [ramp[i]!, ramp[i + 1]!].map((hex) =>
    [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)),
  );
  return `rgb(${a!.map((c, j) => Math.round(c + (b![j]! - c) * (pos - i))).join(", ")})`;
}

type Value = ReturnType<typeof scalar>;
export type LegendRow = { label: string; count: number; color: string };
export type Scale = {
  color: (value: Value) => string;
  missing: number;
  missingColor: string;
} & (
  | { ramp: string[]; min: number; max: number }
  | { ramp?: undefined; rows: LegendRow[] }
);

export function makeScale(
  key: string,
  values: Value[],
  ramp: readonly string[],
  colors: ThemeColors,
): Scale {
  const missingColor = colors.line;
  const otherColor = colors["ink-subtle"];
  const present = values.filter((v) => v !== undefined);
  const missing = values.length - present.length;

  if (
    present.length &&
    present.every((v) => typeof v === "number") &&
    !ID_KEY.test(key)
  ) {
    const min = Math.min(...present);
    const max = Math.max(...present);
    const stops = ramp.map((name) => colors[name as keyof ThemeColors]);
    return {
      color: (v) =>
        typeof v !== "number"
          ? missingColor
          : rampColor(stops, max > min ? (v - min) / (max - min) : 1),
      ramp: stops,
      min,
      max,
      missing,
      missingColor,
    };
  }

  const counts = new Map<string, number>();
  for (const v of present)
    counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const categorical = CATEGORICAL.map((name) => colors[name]);
  const booleans = present.every((v) => typeof v === "boolean");
  const rows: LegendRow[] = ranked
    .slice(0, categorical.length)
    .map(([label, count], i) => ({
      label,
      count,
      color: booleans
        ? label === "true"
          ? categorical[0]!
          : otherColor
        : categorical[i]!,
    }));
  const byLabel = new Map(rows.map((row) => [row.label, row.color]));
  const rest = ranked.slice(categorical.length);
  if (rest.length)
    rows.push({
      label: `other (${rest.length} values)`,
      count: rest.reduce((sum, [, count]) => sum + count, 0),
      color: otherColor,
    });
  return {
    color: (v) =>
      v === undefined ? missingColor : (byLabel.get(String(v)) ?? otherColor),
    rows,
    missing,
    missingColor,
  };
}

export type ThemeSettings = {
  /** The attribute to colour by; "" for the default. */
  edgeTheme: string;
  nodeTheme: string;
  showEdges: boolean;
  showNodes: boolean;
  labelEdges: boolean;
  labelNodes: boolean;
};

export const DEFAULT_THEMES: ThemeSettings = {
  edgeTheme: "",
  nodeTheme: "",
  showEdges: true,
  showNodes: true,
  labelEdges: false,
  labelNodes: false,
};

export type ThemedEdge = RouteEdge & {
  value: Value;
  nodeValue: Value;
  label: string;
  nodeLabel: string;
  color: string;
  nodeColor: string;
};

/**
 * The edges coloured and labelled by the chosen attributes. A chosen attribute
 * these edges don't have falls back to the default.
 */
export function themeEdges(
  edges: RouteEdge[],
  settings: ThemeSettings,
  colors: ThemeColors,
) {
  const nodes = edges.filter((e) => e.node);
  const edgeKeys = themeKeys(edges.map((e) => e.edge));
  const nodeKeys = themeKeys(nodes.map((e) => e.node));
  const edgeTheme = edgeKeys.includes(settings.edgeTheme)
    ? settings.edgeTheme
    : "";
  const nodeTheme = nodeKeys.includes(settings.nodeTheme)
    ? settings.nodeTheme
    : "";

  const values = edges.map((e) => ({
    value: scalar(e.edge[edgeTheme]),
    nodeValue: scalar(e.node?.[nodeTheme]),
  }));
  const edgeScale = edgeTheme
    ? makeScale(
        edgeTheme,
        values.map((v) => v.value),
        EDGE_RAMP,
        colors,
      )
    : null;
  const nodeScale = nodeTheme
    ? makeScale(
        nodeTheme,
        values.filter((_, i) => edges[i]!.node).map((v) => v.nodeValue),
        NODE_RAMP,
        colors,
      )
    : null;
  const label = (theme: string, value: Value, idx: number) =>
    theme ? (value === undefined ? "" : fmtValue(value)) : `#${idx}`;

  const themed: ThemedEdge[] = edges.map((e, i) => {
    const { value, nodeValue } = values[i]!;
    return {
      ...e,
      value,
      nodeValue,
      label: label(edgeTheme, value, e.idx),
      nodeLabel: label(nodeTheme, nodeValue, e.idx),
      color: edgeScale ? edgeScale.color(value) : colors.green,
      nodeColor: nodeScale ? nodeScale.color(nodeValue) : colors.surface,
    };
  });
  return {
    edges: themed,
    edgeKeys,
    nodeKeys,
    edgeTheme,
    nodeTheme,
    edgeScale,
    nodeScale,
  };
}
