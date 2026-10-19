import type { Map as MapLibreMap } from "maplibre-gl";
import {
  createContext,
  use,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type MapState = [
  MapLibreMap | null,
  Dispatch<SetStateAction<MapLibreMap | null>>,
];

const MapContext = createContext<MapState | null>(null);

/** Makes the map of the MapView inside it available to everything inside it, e.g. a panel next to the map. */
export function MapProvider({ children }: { children: ReactNode }) {
  const state = useState<MapLibreMap | null>(null);
  return <MapContext value={state}>{children}</MapContext>;
}

export function useMapState() {
  const state = use(MapContext);
  if (!state) throw new Error("Wrap the page in a <MapProvider>.");
  return state;
}

/** The map, once it has loaded; null before. */
export const useMap = () => useMapState()[0];

/** The loaded map, for the hooks of components rendered inside a MapView (which only renders them then). */
export function useLoadedMap() {
  const map = useMap();
  if (!map) throw new Error("Only use this inside a <MapView>.");
  return map;
}

// Maps that are being or have been removed. React cleans up a MapView before its children, so their cleanup
// has to skip what went with the map.
export const removedMaps = new WeakSet<MapLibreMap>();
