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

/** Shares the map of the MapView inside it, e.g. with a side panel. */
export function MapProvider({ children }: { children: ReactNode }) {
  const state = useState<MapLibreMap | null>(null);
  return <MapContext value={state}>{children}</MapContext>;
}

export function useMapState() {
  const state = use(MapContext);
  if (!state) throw new Error("Wrap the page in a <MapProvider>.");
  return state;
}

/** Null until the map has loaded. */
export const useMap = () => useMapState()[0];

/** For components inside a MapView, which only renders them once loaded. */
export function useLoadedMap() {
  const map = useMap();
  if (!map) throw new Error("Only use this inside a <MapView>.");
  return map;
}

// React cleans up a MapView before its children, which must then leave the removed map alone
export const removedMaps = new WeakSet<MapLibreMap>();
