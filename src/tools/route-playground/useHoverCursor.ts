import { useEffect } from "react";
import { useLoadedMap } from "../../shared/map/context";

/** A pointer over the features of `layers`, which must be stable. */
export function useHoverCursor(layers: string[], enabled: boolean) {
  const map = useLoadedMap();
  useEffect(() => {
    if (!enabled) return;
    const canvas = map.getCanvas();
    const subscriptions = layers.flatMap((layer) => [
      map.on("mouseenter", layer, () => (canvas.style.cursor = "pointer")),
      map.on("mouseleave", layer, () => (canvas.style.cursor = "crosshair")),
    ]);
    return () => subscriptions.forEach((s) => s.unsubscribe());
  }, [map, layers, enabled]);
}
