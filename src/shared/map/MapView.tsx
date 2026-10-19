import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { Map as MapLibreMap, setWorkerUrl, type MapOptions } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { cn } from "../cn";
import { useStoredState } from "../hooks/useStoredState";
import { useDarkScheme } from "../theme/colors";
import { Toggle } from "../ui/Toggle";
import {
  BASEMAP_KEY,
  BASEMAP_LAYER,
  basemapPaint,
  basemapStyle,
} from "./basemap";
import { removedMaps, useMapState } from "./context";

// bundling separates MapLibre from its worker
setWorkerUrl(workerUrl);

const isTrue = (raw: unknown) => raw === true;

type Props = {
  /** Only read when the map is created. */
  options?: Omit<MapOptions, "container" | "style">;
  onLoad?: (map: MapLibreMap) => void;
  className?: string;
  /** Rendered once the map has loaded. */
  children?: ReactNode;
};

/** A MapLibre map on the OSM basemap. Needs a MapProvider around it. */
export function MapView({ options, onLoad, className, children }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useMapState();
  const [colour, setColour] = useStoredState(BASEMAP_KEY, isTrue);
  const dark = useDarkScheme();

  const create = useEffectEvent(
    () =>
      new MapLibreMap({
        ...options,
        container: container.current!,
        style: basemapStyle(colour, dark),
      }),
  );
  const loaded = useEffectEvent((instance: MapLibreMap) => {
    setMap(instance);
    onLoad?.(instance);
  });
  useEffect(() => {
    const instance = create();
    instance.once("load", () => loaded(instance));
    return () => {
      removedMaps.add(instance);
      setMap(null);
      instance.remove();
    };
  }, [setMap]);

  useEffect(() => {
    if (!map) return;
    for (const [property, value] of Object.entries(basemapPaint(colour, dark)))
      map.setPaintProperty(
        BASEMAP_LAYER,
        property as "raster-saturation",
        value,
      );
  }, [map, colour, dark]);

  return (
    <div className={cn("relative", className)}>
      {/* sized, not positioned: MapLibre makes it position: relative */}
      <div ref={container} className="size-full" />
      <Toggle
        className="absolute top-4 left-1/2 z-[2] -translate-x-1/2 rounded-lg bg-surface-raised px-3 py-2 shadow-float"
        checked={colour}
        onChange={(e) => setColour(e.target.checked)}
      >
        Color map
      </Toggle>
      {map && children}
    </div>
  );
}
