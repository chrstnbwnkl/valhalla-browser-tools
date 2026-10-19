import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { Map as MapLibreMap, setWorkerUrl, type MapOptions } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { cn } from "../cn";
import { useDarkScheme } from "../theme/colors";
import {
  BASEMAP_LAYER,
  BasemapToggle,
  useColourBasemap,
  basemapPaint,
  basemapStyle,
} from "./basemap";
import { removedMaps, useMapState } from "./context";

// bundling separates MapLibre from its worker
setWorkerUrl(workerUrl);

type Props = {
  /** Only read when the map is created. */
  options?: Omit<MapOptions, "container" | "style">;
  onLoad?: (map: MapLibreMap) => void;
  /** The basemap colour of a page with several maps; without it, the map has its own switch. */
  colour?: boolean;
  className?: string;
  /** Rendered once the map has loaded. */
  children?: ReactNode;
};

/** A MapLibre map on the OSM basemap. Needs a MapProvider around it. */
export function MapView({
  options,
  onLoad,
  colour: pageColour,
  className,
  children,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useMapState();
  const [stored, setStored] = useColourBasemap();
  const colour = pageColour ?? stored;
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
      {pageColour === undefined && (
        <BasemapToggle colour={stored} onChange={setStored} />
      )}
      {map && children}
    </div>
  );
}
