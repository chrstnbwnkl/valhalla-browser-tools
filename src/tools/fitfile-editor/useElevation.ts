import { useEffect, useEffectEvent, useRef, useState } from "react";
import { fetchHeights } from "../../shared/course";
import {
  createSampler,
  type Progress,
} from "../../shared/elevation/mapterhorn";
import type { FitRecord } from "../../shared/fit";
import type { ElevationSource } from "./types";

type Loaded = { key: string; track: string; source: ElevationSource } & (
  { heights: number[]; note: string | null } | { error: string }
);

/**
 * The heights of the records from `source`, loaded once per track and source;
 * what was loaded for the other source stays, for comparison.
 */
export function useElevation(
  server: string,
  records: FitRecord[],
  source: ElevationSource,
  zoom: number,
) {
  const sampler = useRef<ReturnType<typeof createSampler> | null>(null);
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  // a new spacing or route makes a new track
  const track = `${records.length}|${records.at(-1)?.distance ?? 0}`;
  const keyOf = (s: ElevationSource) =>
    `${track}|${s}|${s === "mapterhorn" ? zoom : ""}`;
  const key = keyOf(source);
  const found = loaded.find((entry) => entry.key === key);

  const load = useEffectEvent(async (signal: AbortSignal) => {
    const coords = records.map((r) => [r.lon, r.lat]);
    const add = (
      entry: { heights: number[]; note: string | null } | { error: string },
    ) =>
      setLoaded((all) => [
        // the other source's heights for this track stay
        ...all.filter((e) => e.track === track && e.source !== source),
        { key, track, source, ...entry },
      ]);
    try {
      if (source === "valhalla") {
        const heights = await fetchHeights(server, coords, signal);
        add(
          heights
            ? { heights, note: null }
            : { error: `${server} has no elevation data here.` },
        );
      } else {
        sampler.current ??= createSampler();
        const { heights, zooms } = await sampler.current(coords, zoom, {
          signal,
          onProgress: setProgress,
        });
        const lowest = zooms.reduce((a, b) => Math.min(a, b), zoom);
        add({
          heights,
          note:
            lowest < zoom
              ? `Mapterhorn has part of the route only down to z${lowest}.`
              : null,
        });
      }
    } catch (e) {
      if (!signal.aborted)
        add({
          error:
            source === "valhalla"
              ? `/height on ${server} failed: ${(e as Error).message}`
              : (e as Error).message,
        });
    } finally {
      if (!signal.aborted) setProgress(null);
    }
  });

  const needed = !found && records.length > 0;
  useEffect(() => {
    if (!needed) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [needed, key]);

  const other = loaded.find(
    (e) => e.key === keyOf(source === "valhalla" ? "mapterhorn" : "valhalla"),
  );
  return {
    heights: found && "heights" in found ? found.heights : null,
    note: found && "heights" in found ? found.note : null,
    error: found && "error" in found ? found.error : null,
    /** The heights of the other source, where they were loaded for this track. */
    other: other && "heights" in other ? other.heights : null,
    loading: needed,
    progress,
  };
}
