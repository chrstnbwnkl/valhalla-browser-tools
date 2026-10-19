import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { Map as MapLibreMap, setWorkerUrl, type MapOptions } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { cn } from "../cn";
import { useStoredState } from "../hooks/useStoredState";
import { Toggle } from "../ui/Toggle";
import { useDarkScheme } from "../theme/colors";
import {
  BASEMAP_KEY,
  BASEMAP_LAYER,
  COLOUR_BASEMAP,
  basemapPaint,
  basemapStyle,
} from "./basemap";
import { removedMaps, useMapState } from "./context";

// MapLibre looks for its worker next to its own module, which bundling moves; point it at the copy Vite emits
setWorkerUrl(workerUrl);

type Props = {
  /** Read once, when the map is created. The style is the shared OSM basemap. */
  options?: Omit<MapOptions, "container" | "style">;
  className?: string;
  /** Called with the map once it has loaded. */
  onLoad?: (map: MapLibreMap) => void;
  /** Rendered once the map has loaded: layers, markers and the like, and overlays on the map. */
  children?: ReactNode;
};

/** A MapLibre map on the shared basemap, with its greyscale/colour switch. Needs a MapProvider around it. */
export function MapView({ options, onLoad, className, children }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useMapState();
  const [colour, setColour] = useStoredState(BASEMAP_KEY, COLOUR_BASEMAP);
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
      {/* MapLibre makes it position: relative, so it is sized, not positioned */}
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
