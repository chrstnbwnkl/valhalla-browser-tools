import type { Position } from "geojson";
import { cn } from "../../shared/cn";
import { useScrollToRow } from "../../shared/hooks/useScrollToRow";
import { Badge } from "../../shared/ui/Badge";
import { WayLink } from "../../shared/valhalla/WayLinks";
import type { TracedLeg } from "./edges";
import { fmt, fmtValue } from "../../shared/format";
import { ACTIVE_ROW, LEG, METRICS, ROW, SWATCH } from "./lists";
import type { ThemedEdge } from "./themes";

type Props = {
  edges: ThemedEdge[];
  legs: TracedLeg[];
  edgeTheme: string;
  nodeTheme: string;
  /** Of the edge lengths. */
  unit: string;
  highlighted: number | null;
  onHover: (idx: number | null) => void;
  onFocus: (coords: Position[]) => void;
};

export function EdgeList({
  edges,
  legs,
  edgeTheme,
  nodeTheme,
  unit,
  highlighted,
  onHover,
  onFocus,
}: Props) {
  const rowRef = useScrollToRow(highlighted);

  return (
    <ol aria-label="Edges" className="m-0 list-none border-t border-line p-0">
      {edges.map((e) => {
        const { edge } = e;
        const legStarts = legs.length > 1 && e.leg !== edges[e.idx - 1]?.leg;
        const leg = legs[e.leg]!;
        return [
          legStarts && (
            <li key={`leg:${e.leg}`} className={LEG}>
              Leg {e.leg} · {leg.path.edges.length} edges
              {leg.snapped && <Badge tone="amber">map-matched</Badge>}
            </li>
          ),
          <li
            key={e.idx}
            ref={rowRef(e.idx)}
            className={cn(ROW, e.idx === highlighted && ACTIVE_ROW)}
            onMouseEnter={() => onHover(e.idx)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onFocus(e.coords)}
          >
            <span className={SWATCH} style={{ background: e.color }} />
            <div className="min-w-0 flex-1 font-bold">
              {edge.names?.join(" / ") || "Unnamed"}
              <small className="caption block text-ink-muted">
                {[`#${e.idx}`, edge.road_class, edge.use]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
            <div className={METRICS}>
              <b>
                {edgeTheme === "way_id" && e.value !== undefined ? (
                  <WayLink id={String(e.value)} />
                ) : edgeTheme ? (
                  fmtValue(e.value)
                ) : (
                  fmt(edge.length, unit)
                )}
              </b>
              {edgeTheme && typeof edge.length === "number" && (
                <small className="block text-ink-muted">
                  {fmt(edge.length, unit)}
                </small>
              )}
              {nodeTheme && e.node && (
                <small className="block text-ink-muted">
                  <span
                    className="mr-1 inline-block size-2 rounded-full border border-ink"
                    style={{ background: e.nodeColor }}
                  />
                  {fmtValue(e.nodeValue)}
                </small>
              )}
            </div>
          </li>,
        ];
      })}
    </ol>
  );
}
