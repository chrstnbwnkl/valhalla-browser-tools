import {
  Marker as MapLibreMarker,
  type LngLat,
  type MarkerOptions,
} from "maplibre-gl";
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
  /** Only read when the marker is created. */
  anchor?: MarkerOptions["anchor"];
  offset?: [number, number];
  /** Classes of the marker element itself, e.g. for its z-index. */
  className?: string;
  onDragEnd?: (lngLat: LngLat) => void;
  /** A native listener, so stopping the event keeps it from the map. */
  onContextMenu?: (e: MouseEvent) => void;
  /** A click that wasn't the end of a drag. */
  onClick?: () => void;
  children: ReactNode;
};

export function Marker({
  lngLat,
  draggable = false,
  anchor,
  offset,
  className,
  onDragEnd,
  onContextMenu,
  onClick,
  children,
}: Props) {
  const map = useLoadedMap();
  const [element] = useState(() => document.createElement("div"));
  const marker = useRef<MapLibreMarker | null>(null);
  const [lon, lat] = lngLat;

  const position = useEffectEvent(() => lngLat);
  const placement = useEffectEvent(() => ({ anchor, offset }));
  const dragEnd = useEffectEvent((at: LngLat) => onDragEnd?.(at));
  useEffect(() => {
    const instance = new MapLibreMarker({
      element,
      draggable,
      ...placement(),
    })
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

  useEffect(() => {
    const classes = className?.split(/\s+/).filter(Boolean) ?? [];
    element.classList.add(...classes);
    return () => element.classList.remove(...classes);
  }, [element, className]);

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

  const click = useEffectEvent(() => onClick?.());
  useEffect(() => {
    // a drag ends in a click too; only count presses that barely moved
    let start: { x: number; y: number } | null = null;
    let moved = false;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      moved = false;
    };
    const onMove = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4)
        moved = true;
    };
    const onClickEvent = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const wasDrag = moved;
      start = null;
      moved = false;
      if (!wasDrag) click();
    };
    // the pointer leaves the marker while dragging, so watch the document
    document.addEventListener("pointermove", onMove);
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("click", onClickEvent);
    return () => {
      document.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("click", onClickEvent);
    };
  }, [element]);

  return createPortal(children, element);
}
