// as MapLibre's ScaleControl: a bar of at most 100 px, for a round distance
const MAX_WIDTH = 100;
const EARTH_CIRCUMFERENCE = 40075016.686;

function roundDown(n: number) {
  const pow10 = 10 ** Math.floor(Math.log10(n));
  const d = n / pow10;
  return pow10 * (d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1);
}

/** The scale bar at a latitude and zoom (with MapLibre's 512 px tiles). */
export function scaleBar(lat: number, zoom: number) {
  const metersPerPixel =
    (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const meters = roundDown(metersPerPixel * MAX_WIDTH);
  return {
    width: meters / metersPerPixel,
    label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m`,
  };
}
