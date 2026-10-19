import {
  NavigationControl,
  ScaleControl,
  type ControlPosition,
} from "maplibre-gl";
import { useControl } from "./hooks";

export function Controls({
  navigation = "top-right",
  scale = "bottom-left",
}: {
  navigation?: ControlPosition;
  scale?: ControlPosition;
}) {
  useControl(() => new NavigationControl({ showCompass: false }), navigation);
  useControl(() => new ScaleControl(), scale);
  return null;
}
