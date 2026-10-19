import { NavigationControl, ScaleControl } from "maplibre-gl";
import { useControl } from "./hooks";

export function Controls() {
  useControl(() => new NavigationControl({ showCompass: false }), "top-right");
  useControl(() => new ScaleControl());
  return null;
}
