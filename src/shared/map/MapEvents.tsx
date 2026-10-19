import type { MapEventType } from "maplibre-gl";
import { useMapEvent } from "./hooks";

type Props = {
  onClick?: (e: MapEventType["click"]) => void;
  onContextMenu?: (e: MapEventType["contextmenu"]) => void;
  onMoveStart?: () => void;
};

/** Listens to the map itself; its features have useLayerEvent. */
export function MapEvents({ onClick, onContextMenu, onMoveStart }: Props) {
  useMapEvent("click", (e) => onClick?.(e));
  useMapEvent("contextmenu", (e) => onContextMenu?.(e));
  useMapEvent("movestart", () => onMoveStart?.());
  return null;
}
