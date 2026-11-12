import type { Map as MapLibreMap } from "maplibre-gl";
import { useState } from "react";
import { useLoadedMap } from "./context";
import { useMapEvent } from "./hooks";

/** The view of `map` on openstreetmap.org, whose 256 px tiles are a zoom level further in. */
export function osmUrl(map: MapLibreMap) {
  const { lng, lat } = map.getCenter().wrap();
  const zoom = Math.max(0, Math.min(19, Math.round(map.getZoom() + 1)));
  return `https://www.openstreetmap.org/#map=${zoom}/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}

/** A link to the current view on openstreetmap.org, in the lower right corner of the map. */
export function OsmLink() {
  const map = useLoadedMap();
  const [href, setHref] = useState(() => osmUrl(map));
  useMapEvent("moveend", () => setHref(osmUrl(map)));
  return (
    <a
      className="absolute right-2.5 bottom-10 z-[2] rounded-lg bg-surface-raised px-3 py-1.5 font-sans text-[13px]/5 font-bold text-ink no-underline shadow-float hover:underline"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="This view on openstreetmap.org, in a new tab"
    >
      Open in OSM
    </a>
  );
}
