import type { MapOptions } from "maplibre-gl";
import type { Codec } from "../hooks/useStoredState";

// The OSM tiles, in high-contrast greyscale (inverted for the dark theme) so only what is drawn on top has
// colour; the toggle on the map brings back their own colours, for every tool.
export const BASEMAP_KEY = "valhalla-browser-tools:basemap";
export const BASEMAP_LAYER = "osm";

// stored as a bare word, which the tools not ported yet read too
export const COLOUR_BASEMAP: Codec<boolean> = {
  read: (stored) => stored === "colour",
  write: (colour) => (colour ? "colour" : "grey"),
};

export function basemapPaint(colour: boolean, dark: boolean) {
  if (colour)
    return {
      "raster-saturation": 0,
      "raster-brightness-min": 0,
      "raster-brightness-max": 1,
      "raster-contrast": 0,
    };
  return dark
    ? {
        "raster-saturation": -1,
        "raster-brightness-min": 0.9,
        "raster-brightness-max": 0.04,
        "raster-contrast": 0.1,
      }
    : {
        "raster-saturation": -1,
        "raster-brightness-min": 0.08,
        "raster-brightness-max": 1,
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
