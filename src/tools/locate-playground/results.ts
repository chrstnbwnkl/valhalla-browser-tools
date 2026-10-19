import type { Feature, LineString, Point, Polygon } from "geojson";
import {
  circle,
  decodePolyline,
  line,
  point,
  type Properties,
} from "../../shared/map/geo";
import type { ThemeColors } from "../../shared/theme/colors";

// what is used of a /locate response; verbose ones add the optional parts
export type LocateEdge = {
  way_id?: number;
  correlated_lat: number;
  correlated_lon: number;
  side_of_street?: string;
  percent_along?: number;
  distance?: number;
  outbound_reach?: number;
  inbound_reach?: number;
  edge_info?: { way_id?: number; names?: string[]; shape?: string };
  edge?: { forward?: boolean; classification?: { classification?: string } };
  bounding_circle?: { lat: number; lon: number; radius: number };
};
export type LocateNode = {
  lat: number;
  lon: number;
  type?: string;
  edge_count?: number;
  intersection_type?: string;
};
export type LocateResult = {
  input_lat: number;
  input_lon: number;
  edges?: LocateEdge[] | null;
  nodes?: LocateNode[] | null;
};

// one colour per location; magenta is for highlights
const SERIES = ["green", "ink", "blue", "amber"] as const;
export const seriesColor = (colors: ThemeColors, i: number) =>
  colors[SERIES[i % SERIES.length]!];

const fmt = (n: unknown, unit = "") =>
  typeof n === "number" ? `${+n.toFixed(1)}${unit}` : "–";

/** A correlated edge or node in the panel; `idx` ties it to its features on the map. */
export type Row = {
  idx: number;
  title: string;
  detail: string;
  object: unknown;
};
export type Section = {
  location: number;
  color: string;
  summary: string;
  rows: Row[];
};

export function edgeRow(edge: LocateEdge): Pick<Row, "title" | "detail"> {
  const info = edge.edge_info;
  const wayId = edge.way_id ?? info?.way_id;
  const parts = [
    `way ${wayId ?? "–"}`,
    edge.side_of_street,
    `${fmt(typeof edge.percent_along === "number" ? edge.percent_along * 100 : undefined)} % along`,
  ];
  // the rest is only there in verbose responses
  if (edge.edge) parts.push(edge.edge.forward ? "forward" : "reverse");
  if (edge.edge?.classification?.classification)
    parts.push(edge.edge.classification.classification);
  if (typeof edge.distance === "number")
    parts.push(`${fmt(edge.distance, " m")} away`);
  if (typeof edge.outbound_reach === "number")
    parts.push(`reach ${edge.outbound_reach} out / ${edge.inbound_reach} in`);
  return {
    title: info ? info.names?.join(" / ") || "unnamed" : `way ${wayId}`,
    detail: info ? parts.join(" · ") : parts.slice(1).join(" · "),
  };
}

export function nodeRow(node: LocateNode): Pick<Row, "title" | "detail"> {
  const parts = [
    node.type,
    typeof node.edge_count === "number" ? `${node.edge_count} edges` : null,
    node.intersection_type,
  ];
  return {
    title: "node",
    detail: parts.filter(Boolean).join(" · ") || `${node.lat}, ${node.lon}`,
  };
}

export type Results = {
  sections: Section[];
  edges: Feature<LineString, Properties>[];
  circles: Feature<Polygon, Properties>[];
  /** From each input point to what it was correlated with. */
  snaps: Feature<LineString, Properties>[];
  /** Correlated points on edges (hollow) and nodes (filled). */
  points: Feature<Point, Properties>[];
};

export function buildResults(
  data: LocateResult[],
  colors: ThemeColors,
): Results {
  const results: Results = {
    sections: [],
    edges: [],
    circles: [],
    snaps: [],
    points: [],
  };
  let idx = 0;
  data.forEach((result, location) => {
    const color = seriesColor(colors, location);
    const from = [result.input_lon, result.input_lat];
    const edges = result.edges ?? [];
    const nodes = result.nodes ?? [];
    const section: Section = {
      location,
      color,
      summary:
        edges.length + nodes.length
          ? `${edges.length} edges, ${nodes.length} nodes`
          : "nothing found",
      rows: [],
    };
    results.sections.push(section);

    for (const edge of edges) {
      section.rows.push({ idx, ...edgeRow(edge), object: edge });
      const at = [edge.correlated_lon, edge.correlated_lat];
      if (edge.edge_info?.shape)
        results.edges.push(
          line(decodePolyline(edge.edge_info.shape, 6), {
            idx,
            color,
            reverse: edge.edge?.forward === false,
          }),
        );
      const bounds = edge.bounding_circle;
      if (bounds)
        results.circles.push(
          circle([bounds.lon, bounds.lat], bounds.radius, { idx }),
        );
      results.snaps.push(line([from, at], { color }));
      results.points.push(
        point(at, { idx, fill: colors.surface, stroke: color }),
      );
      idx++;
    }
    for (const node of nodes) {
      section.rows.push({ idx, ...nodeRow(node), object: node });
      const at = [node.lon, node.lat];
      results.snaps.push(line([from, at], { color }));
      results.points.push(
        point(at, { idx, fill: color, stroke: colors.surface }),
      );
      idx++;
    }
  });
  return results;
}

export const counts = (data: LocateResult[]) => ({
  edges: data.reduce((sum, result) => sum + (result.edges?.length ?? 0), 0),
  nodes: data.reduce((sum, result) => sum + (result.nodes?.length ?? 0), 0),
});
