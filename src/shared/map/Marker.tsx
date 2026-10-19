import { Marker as MapLibreMarker, type LngLat } from "maplibre-gl";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLoadedMap } from "./context";

type Props = {
  lngLat: [lon: number, lat: number];
  draggable?: boolean;
  onDragEnd?: (lngLat: LngLat) => void;
  /** A native listener, so it runs before the map's own: stopping the event keeps it from the map. */
  onContextMenu?: (e: MouseEvent) => void;
  /** What the marker looks like. */
  children: ReactNode;
};

/** A MapLibre marker showing `children`. */
export function Marker({
  lngLat,
  draggable = false,
  onDragEnd,
  onContextMenu,
  children,
}: Props) {
  const map = useLoadedMap();
  const [element] = useState(() => document.createElement("div"));
  const marker = useRef<MapLibreMarker | null>(null);
  const [lon, lat] = lngLat;

  const position = useEffectEvent(() => lngLat);
  const dragEnd = useEffectEvent((at: LngLat) => onDragEnd?.(at));
  useEffect(() => {
    const instance = new MapLibreMarker({ element, draggable })
      .setLngLat(position())
      .addTo(map);
    instance.on("dragend", () => dragEnd(instance.getLngLat()));
    marker.current = instance;
    return () => {
      instance.remove();
      marker.current = null;
    };
  }, [map, element, draggable]);

  useEffect(() => {
    marker.current?.setLngLat([lon, lat]);
  }, [lon, lat]);

  const contextMenu = useEffectEvent((e: MouseEvent) => onContextMenu?.(e));
  useEffect(() => {
    // MapLibre starts a drag on any button, and a right-click's release lands on the context menu, not the map,
    // so the drag would never end and the next click on the map would move the marker there
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) e.stopPropagation();
    };
    element.addEventListener("mousedown", onMouseDown);
    element.addEventListener("contextmenu", contextMenu);
    return () => {
      element.removeEventListener("mousedown", onMouseDown);
      element.removeEventListener("contextmenu", contextMenu);
    };
  }, [element]);

  return createPortal(children, element);
}
