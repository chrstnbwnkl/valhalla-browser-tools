import { snapToTrack } from "../../shared/course";
import type { FitRecord } from "../../shared/fit";
import type { Json } from "../../shared/valhalla/request";
import type { Filters } from "../route-playground/api";
import type { RouteEdge, TraceEdge } from "../route-playground/edges";

/** What of trace_attributes the suggestions and the elevation fix need. */
export const TRACE_FILTERS: Filters = {
  action: "include",
  attributes: [
    "edge.bridge",
    "edge.tunnel",
    "edge.unpaved",
    "edge.use",
    "edge.max_upward_grade",
    "edge.names",
    "node.type",
  ],
};

/** An edge with where along the track it starts and ends. */
export type Span = {
  edge: TraceEdge;
  node: Json | undefined;
  from: number;
  to: number;
};

// how far past the last edge the next one is looked for
const WINDOW = 5000;

/** Places every edge on the track, in order. */
export function spansOf(edges: RouteEdge[], records: FitRecord[]): Span[] {
  const spans: Span[] = [];
  let after = 0;
  for (const { edge, node, coords } of edges) {
    const first = coords[0];
    const last = coords.at(-1);
    if (!first || !last) continue;
    const from =
      snapToTrack(records, first, Math.max(0, after - 1), WINDOW)?.distance ??
      after;
    const to = snapToTrack(records, last, from, WINDOW)?.distance ?? from;
    spans.push({ edge, node, from, to: Math.max(from, to) });
    after = Math.max(from, to);
  }
  return spans;
}

/** Runs of consecutive spans `test` holds for, as [from, to] in meters, with their first span. */
export function runs(spans: Span[], test: (span: Span) => boolean) {
  const out: { from: number; to: number; first: Span; spans: Span[] }[] = [];
  let current: (typeof out)[number] | null = null;
  for (const span of spans) {
    if (!test(span)) {
      current = null;
      continue;
    }
    if (current) {
      current.to = span.to;
      current.spans.push(span);
    } else {
      current = { from: span.from, to: span.to, first: span, spans: [span] };
      out.push(current);
    }
  }
  return out;
}

const isStructure = (span: Span) => !!span.edge.bridge || !!span.edge.tunnel;

/**
 * The altitudes with every bridge and tunnel taken straight from one end to
 * the other, as the terrain model has the valley or the hill there instead.
 */
export function flattenStructures(
  records: FitRecord[],
  altitudes: number[],
  spans: Span[],
) {
  const out = [...altitudes];
  for (const { from, to } of runs(spans, isStructure)) {
    let i0 = records.findIndex((r) => r.distance >= from);
    if (i0 < 0) continue;
    if (i0 > 0 && records[i0]!.distance > from) i0--;
    let i1 = i0;
    while (i1 < records.length - 1 && records[i1]!.distance < to) i1++;
    const d0 = records[i0]!.distance;
    const d1 = records[i1]!.distance;
    const [h0, h1] = [out[i0]!, out[i1]!];
    for (let i = i0 + 1; i < i1; i++) {
      const f = (records[i]!.distance - d0) / (d1 - d0 || 1);
      out[i] = h0 + (h1 - h0) * f;
    }
  }
  return out;
}
