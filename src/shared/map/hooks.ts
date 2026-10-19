import {
  type AddLayerObject,
  type ControlPosition,
  type GeoJSONSource,
  type IControl,
  type Map as MapLibreMap,
  type MapEventType,
  type MapLayerEventType,
} from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { useEffect, useEffectEvent, useRef } from "react";
import { removedMaps, useLoadedMap } from "./context";

// The hooks below make the map declarative where that is cheap: they add something when the component mounts,
// update it when its inputs change and remove it on unmount. For anything else, use the map from useMap().

/** A GeoJSON source holding `data`. Call it before the hooks adding the layers that use it. */
export function useGeoJSONSource(id: string, data: GeoJSON) {
  const map = useLoadedMap();
  const add = useEffectEvent(() =>
    map.addSource(id, { type: "geojson", data }),
  );
  useEffect(() => {
    add();
    return () => {
      if (removedMaps.has(map)) return;
      // layers using the source would keep it from being removed; their own cleanup may come later
      for (const layer of map.getStyle().layers) {
        if ("source" in layer && layer.source === id) map.removeLayer(layer.id);
      }
      map.removeSource(id);
    };
  }, [map, id]);

  const update = useEffectEvent(
    () => void map.getSource<GeoJSONSource>(id)?.setData(data),
  );
  useEffect(() => {
    update();
  }, [data]);
}

type Applied = { paint?: object; layout?: object; filter?: unknown };
type PaintKey = Parameters<MapLibreMap["setPaintProperty"]>[1];
type LayoutKey = Parameters<MapLibreMap["setLayoutProperty"]>[1];
export type Filter = Parameters<MapLibreMap["setFilter"]>[1];

/**
 * A layer, added in the order the hooks are called. Its paint, layout and filter follow `spec`; changing
 * anything else needs a new id.
 */
export function useLayer(spec: AddLayerObject, beforeId?: string) {
  const map = useLoadedMap();
  const { id } = spec;
  // not every kind of layer has all three
  const { paint, layout, filter } = spec as Applied;
  const current: Applied = { paint, layout, filter };
  const applied = useRef<Applied | null>(null);

  const add = useEffectEvent(() => {
    map.addLayer(spec, beforeId);
    applied.current = current;
  });
  useEffect(() => {
    add();
    return () => {
      applied.current = null;
      if (!removedMaps.has(map) && map.getLayer(id)) map.removeLayer(id);
    };
  }, [map, id]);

  const update = useEffectEvent(() => {
    const before = applied.current;
    if (!before) return;
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    for (const kind of ["paint", "layout"] as const) {
      const from = (before[kind] ?? {}) as Record<string, unknown>;
      const to = (current[kind] ?? {}) as Record<string, unknown>;
      for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
        if (same(from[key], to[key])) continue;
        if (kind === "paint")
          map.setPaintProperty(id, key as PaintKey, to[key] as never);
        else map.setLayoutProperty(id, key as LayoutKey, to[key] as never);
      }
    }
    if (!same(before.filter, current.filter))
      map.setFilter(id, current.filter as Filter);
    applied.current = current;
  });
  useEffect(() => update(), [JSON.stringify(current)]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** An image for symbol layers; null leaves it out. */
export function useMapImage(id: string, image: ImageData | null) {
  const map = useLoadedMap();
  useEffect(() => {
    if (!image) return;
    if (map.hasImage(id)) map.updateImage(id, image);
    else map.addImage(id, image, { pixelRatio: 2 });
  }, [map, id, image]);
  useEffect(
    () => () => {
      if (!removedMaps.has(map) && map.hasImage(id)) map.removeImage(id);
    },
    [map, id],
  );
}

/** Calls `handler` on events of the map. */
export function useMapEvent<T extends keyof MapEventType>(
  type: T,
  handler: (e: MapEventType[T]) => void,
) {
  const map = useLoadedMap();
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const subscription = map.on(type, (e) => onEvent(e));
    return () => subscription.unsubscribe();
  }, [map, type]);
}

/** Calls `handler` on events of the features of a layer. */
export function useLayerEvent<T extends keyof MapLayerEventType>(
  type: T,
  layer: string,
  handler: (e: MapLayerEventType[T]) => void,
) {
  const map = useLoadedMap();
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const subscription = map.on(type, layer, (e) => onEvent(e));
    return () => subscription.unsubscribe();
  }, [map, type, layer]);
}

/** A control made by `create`, at `position`. */
export function useControl(create: () => IControl, position?: ControlPosition) {
  const map = useLoadedMap();
  const make = useEffectEvent(create);
  useEffect(() => {
    const control = make();
    map.addControl(control, position);
    return () => {
      if (!removedMaps.has(map)) map.removeControl(control);
    };
  }, [map, position]);
}
