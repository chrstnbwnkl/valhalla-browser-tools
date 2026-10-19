import type { Position } from "geojson";
import { useEffect, useEffectEvent, useState } from "react";
import type { Json } from "../../shared/valhalla/request";
import { traceLegs, type Filters } from "./api";
import type { TracedLeg } from "./edges";

/** Which response, filter and route the edges are for; must be memoized. */
export type TraceKey = {
  sent: Json;
  filters: Filters | null;
  routeIdx: number;
};
type Loaded = TraceKey & ({ legs: TracedLeg[] } | { error: string });

const same = (a: TraceKey, b: TraceKey) =>
  a.sent === b.sent && a.filters === b.filters && a.routeIdx === b.routeIdx;

/** The traced edges of a route's legs, fetched once while `active`. */
export function useTraces(
  server: string,
  key: TraceKey | null,
  shapes: Position[][],
  active: boolean,
) {
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const found = key ? loaded.find((entry) => same(entry, key)) : undefined;
  const needed = active && key !== null && !found;

  const load = useEffectEvent((signal: AbortSignal) => {
    if (!key) return;
    // only what is for the same response and filter stays
    const add = (entry: Loaded) =>
      setLoaded((all) => [
        ...all.filter((e) => e.sent === key.sent && e.filters === key.filters),
        entry,
      ]);
    traceLegs(server, shapes, key.sent, key.filters, signal).then(
      (legs) => add({ ...key, legs }),
      (e: Error) =>
        signal.aborted ||
        add({
          ...key,
          error: `trace_attributes on ${server} failed: ${e.message}`,
        }),
    );
  });
  useEffect(() => {
    if (!needed) return;
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [needed, key]);

  return {
    legs: found && "legs" in found ? found.legs : null,
    error: found && "error" in found ? found.error : null,
    loading: needed,
  };
}
