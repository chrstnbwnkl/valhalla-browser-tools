import type { MapOptions } from "maplibre-gl";

export const BASEMAP_KEY = "valhalla-browser-tools:color-basemap";
export const BASEMAP_LAYER = "osm";

/** Greyscale (inverted when dark) so what's drawn on top stands out, or the tiles' own colours. */
export function basemapPaint(colour: boolean, dark: boolean) {
  if (colour)
    return {
      "raster-saturation": 0,
      "raster-brightness-min": 0,
      "raster-brightness-max": 1,
      "raster-contrast": 0,
    };
  return {
    "raster-saturation": -1,
    "raster-brightness-min": dark ? 0.9 : 0.08,
    "raster-brightness-max": dark ? 0.04 : 1,
    "raster-contrast": 0.1,
  };
}

export const basemapStyle = (
  colour: boolean,
  dark: boolean,
): MapOptions["style"] => ({
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: BASEMAP_LAYER,
      type: "raster",
      source: "osm",
      paint: basemapPaint(colour, dark),
    },
  ],
});
