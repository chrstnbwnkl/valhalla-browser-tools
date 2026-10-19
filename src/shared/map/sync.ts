import type { Map as MapLibreMap } from "maplibre-gl";

const cameraOf = (map: MapLibreMap) => ({
  center: map.getCenter(),
  zoom: map.getZoom(),
  bearing: map.getBearing(),
  pitch: map.getPitch(),
});

export type Camera = ReturnType<typeof cameraOf>;

/** Keeps maps showing the same view: moving one moves the others. */
export function createMapSync() {
  const maps = new Set<MapLibreMap>();
  const listeners = new Set<() => void>();
  // the view they share; null without maps
  let camera: Camera | null = null;
  // jumpTo fires move on the followers, which mustn't move the others in turn
  let syncing = false;

  function follow(leader: MapLibreMap) {
    if (syncing) return;
    syncing = true;
    camera = cameraOf(leader);
    for (const map of maps) if (map !== leader) map.jumpTo(camera);
    syncing = false;
    for (const listener of listeners) listener();
  }

  return {
    /**
     * Adds a map, which takes over the view of the others, or with `lead` gives
     * them its own; returns its removal.
     */
    add(map: MapLibreMap, lead = false) {
      const [other] = maps;
      maps.add(map);
      if (other && !lead) map.jumpTo(cameraOf(other));
      else follow(map);
      const subscription = map.on("move", () => follow(map));
      return () => {
        maps.delete(map);
        subscription.unsubscribe();
        if (!maps.size) {
          camera = null;
          for (const listener of listeners) listener();
        }
      };
    },
    get size() {
      return maps.size;
    },
    /** The shared view, for useSyncExternalStore. */
    camera: () => camera,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    zoomIn: () => [...maps][0]?.zoomIn(),
    zoomOut: () => [...maps][0]?.zoomOut(),
  };
}

export type MapSync = ReturnType<typeof createMapSync>;
