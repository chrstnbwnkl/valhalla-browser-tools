import type {
  AddLayerObject,
  ControlPosition,
  GeoJSONSource,
  IControl,
  Map as MapLibreMap,
  MapEventType,
  MapLayerEventType,
} from "maplibre-gl";
import type { GeoJSON } from "geojson";
import { useEffect, useEffectEvent } from "react";
import { removedMaps, useLoadedMap } from "./context";

// Each hook adds something to the map on mount, keeps it in sync with its
// arguments and removes it on unmount.

export type Filter = Parameters<MapLibreMap["setFilter"]>[1];
type PaintKey = Parameters<MapLibreMap["setPaintProperty"]>[1];
type LayoutKey = Parameters<MapLibreMap["setLayoutProperty"]>[1];
type Styled = { paint?: object; layout?: object; filter?: Filter };

/** Call it before the hooks adding layers that use it. */
export function useGeoJSONSource(id: string, data: GeoJSON) {
  const map = useLoadedMap();
  const add = useEffectEvent(() =>
    map.addSource(id, { type: "geojson", data }),
  );
  useEffect(() => {
    add();
    return () => {
      if (removedMaps.has(map)) return;
      // a source can't be removed while layers use it
      for (const layer of map.getStyle().layers) {
        if ("source" in layer && layer.source === id) map.removeLayer(layer.id);
      }
      map.removeSource(id);
    };
  }, [map, id]);

  const update = useEffectEvent(
    () => void map.getSource<GeoJSONSource>(id)?.setData(data),
  );
  useEffect(() => update(), [data]);
}

/** A layer whose paint, layout and filter follow `spec`; anything else needs a new id. */
export function useLayer(spec: AddLayerObject) {
  const map = useLoadedMap();
  const { id } = spec;
  const add = useEffectEvent(() => map.addLayer(spec));
  useEffect(() => {
    add();
    return () => {
      if (!removedMaps.has(map) && map.getLayer(id)) map.removeLayer(id);
    };
  }, [map, id]);

  // MapLibre ignores values that didn't change
  const update = useEffectEvent(() => {
    const { paint = {}, layout = {}, filter } = spec as Styled;
    for (const [key, value] of Object.entries(paint))
      map.setPaintProperty(id, key as PaintKey, value as never);
    for (const [key, value] of Object.entries(layout))
      map.setLayoutProperty(id, key as LayoutKey, value as never);
    map.setFilter(id, filter);
  });
  const version = JSON.stringify(spec);
  useEffect(() => update(), [version]);
}

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
