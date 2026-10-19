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

export const LONG_PRESS_MS = 500;

type Props = {
  lngLat: [lon: number, lat: number];
  draggable?: boolean;
  onDragEnd?: (lngLat: LngLat) => void;
  /** A native listener, so stopping the event keeps it from the map. */
  onContextMenu?: (e: MouseEvent) => void;
  /** Pressing and holding without moving. */
  onLongPress?: () => void;
  children: ReactNode;
};

export function Marker({
  lngLat,
  draggable = false,
  onDragEnd,
  onContextMenu,
  onLongPress,
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
    // only left-button drags; a right-click's drag would never end
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

  const longPress = useEffectEvent(() => onLongPress?.());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | null = null;
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        start = null;
        longPress();
      }, LONG_PRESS_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4)
        cancel();
    };
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", cancel);
    element.addEventListener("pointercancel", cancel);
    return () => {
      cancel();
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", cancel);
      element.removeEventListener("pointercancel", cancel);
    };
  }, [element]);

  return createPortal(children, element);
}
