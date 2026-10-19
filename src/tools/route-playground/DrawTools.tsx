import type { Position } from "geojson";
import { useEffect, useEffectEvent, useRef } from "react";
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  type HexColor,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { removedMaps, useLoadedMap } from "../../shared/map/context";
import type { ThemeColors } from "../../shared/theme/colors";
import { Button } from "../../shared/ui/Button";

export type DrawMode = "polygon" | "linestring";

const polygonStyles = (colors: ThemeColors) => ({
  fillColor: colors.danger as HexColor,
  fillOpacity: 0.15,
  outlineColor: colors.danger as HexColor,
  outlineWidth: 2,
  closingPointColor: colors.danger as HexColor,
  closingPointOutlineColor: colors.surface as HexColor,
});
const lineStyles = (colors: ThemeColors) => ({
  lineStringColor: colors.ink as HexColor,
  lineStringWidth: 3,
  closingPointColor: colors.ink as HexColor,
  closingPointOutlineColor: colors.surface as HexColor,
});

type Props = {
  /** What a click on the map draws; null adds waypoints. */
  mode: DrawMode | null;
  onMode: (mode: DrawMode | null) => void;
  hasPolygons: boolean;
  onDeletePolygons: () => void;
  colors: ThemeColors;
  /** Called with a finished drawing, which is then taken off the map. */
  onFinish: (mode: DrawMode, coordinates: Position[]) => void;
};

export function DrawTools({
  mode,
  onMode,
  hasPolygons,
  onDeletePolygons,
  colors,
  onFinish,
}: Props) {
  const map = useLoadedMap();
  const draw = useRef<TerraDraw | null>(null);

  const finished = useEffectEvent((mode: DrawMode, coordinates: Position[]) =>
    onFinish(mode, coordinates),
  );
  const create = useEffectEvent(() => {
    const instance = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPolygonMode({ styles: polygonStyles(colors) }),
        new TerraDrawLineStringMode({ styles: lineStyles(colors) }),
      ],
    });
    instance.start();
    instance.on("finish", (id, { mode }) => {
      const geometry = instance.getSnapshotFeature(id)?.geometry;
      instance.removeFeatures([id]);
      if (!geometry) return;
      if (mode === "polygon")
        finished(mode, (geometry.coordinates as Position[][])[0]!);
      if (mode === "linestring")
        finished(mode, geometry.coordinates as Position[]);
    });
    return instance;
  });
  useEffect(() => {
    const instance = create();
    draw.current = instance;
    return () => {
      draw.current = null;
      if (!removedMaps.has(map)) instance.stop();
    };
  }, [map]);

  useEffect(() => {
    draw.current?.setMode(mode ?? "static");
    map.getCanvas().style.cursor = mode ? "" : "crosshair";
  }, [map, mode]);

  useEffect(() => {
    draw.current?.setModeStyles("polygon", polygonStyles(colors));
    draw.current?.setModeStyles("linestring", lineStyles(colors));
  }, [colors]);

  // choosing the active mode again ends it
  const toggle = (next: DrawMode) => onMode(mode === next ? null : next);

  return (
    <div className="absolute top-4 left-4 z-[2] flex flex-col gap-1 rounded-lg bg-surface-raised p-1 shadow-float">
      <Button
        size="sm"
        variant={mode === "polygon" ? "ink" : "default"}
        aria-pressed={mode === "polygon"}
        title="Draw polygons that routes avoid; click the first point to finish one"
        onClick={() => toggle("polygon")}
      >
        Exclude polygon
      </Button>
      <Button
        size="sm"
        variant={mode === "linestring" ? "ink" : "default"}
        aria-pressed={mode === "linestring"}
        title="Draw lines whose edges get a cost factor; click the last point again to finish one"
        onClick={() => toggle("linestring")}
      >
        Cost line
      </Button>
      {hasPolygons && (
        <Button size="sm" variant="danger" onClick={onDeletePolygons}>
          Delete all polygons
        </Button>
      )}
    </div>
  );
}
