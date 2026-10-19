import type { Position } from "geojson";
import { decodePolyline } from "../../shared/map/geo";
import type { Json } from "../../shared/valhalla/request";

// what is used of a /trace_attributes response
export type TraceEdge = Json & {
  begin_shape_index?: number;
  end_shape_index?: number;
  end_node?: Json & { admin_index?: number; elapsed_time?: number };
  names?: string[];
  road_class?: string;
  use?: string;
  length?: number;
};
export type TracePath = {
  shape?: string;
  units?: string;
  edges: TraceEdge[];
  admins?: Json[];
};
/** A leg's trace; `snapped` when it had to be map matched rather than edge walked. */
export type TracedLeg = { path: TracePath; snapped: boolean };

export type RouteEdge = {
  idx: number;
  leg: number;
  edge: TraceEdge;
  /** The end node, with the admin it points at in place of its admin_index. */
  node: Json | undefined;
  coords: Position[];
};

function resolveNode(path: TracePath, node: TraceEdge["end_node"]) {
  const admin =
    node?.admin_index === undefined
      ? undefined
      : path.admins?.[node.admin_index];
  if (!node || !admin) return node;
  const { admin_index: _, ...rest } = node;
  return { ...rest, admin };
}

export function routeEdges(legs: TracedLeg[]): RouteEdge[] {
  return legs
    .flatMap(({ path }, leg) => {
      const shape = decodePolyline(path.shape ?? "");
      return path.edges.map((edge) => ({
        leg,
        edge,
        node: resolveNode(path, edge.end_node),
        coords: shape.slice(
          edge.begin_shape_index ?? 0,
          (edge.end_shape_index ?? -1) + 1,
        ),
      }));
    })
    .map((edge, idx) => ({ idx, ...edge }));
}
