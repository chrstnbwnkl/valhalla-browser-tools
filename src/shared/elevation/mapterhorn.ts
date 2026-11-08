import type { Position } from "geojson";

// https://tiles.mapterhorn.com/tilejson.json: terrarium-encoded 512 px webp
export const MAPTERHORN_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";
export const MAPTERHORN_ATTRIBUTION = "© Mapterhorn";
export const MAPTERHORN_ATTRIBUTION_URL = "https://mapterhorn.com/attribution";
const TILE_SIZE = 512;
// how far a tile missing at the zoom asked for falls back
const MIN_ZOOM = 6;
const CONCURRENCY = 6;

export type Pixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};
/** The pixels of a tile, or null where there is none at that zoom. */
export type TileLoader = (
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
) => Promise<Pixels | null>;

export const terrarium = (r: number, g: number, b: number) =>
  r * 256 + g + b / 256 - 32768;

export const loadMapterhornTile: TileLoader = async (z, x, y, signal) => {
  const url = MAPTERHORN_URL.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  const res = await fetch(url, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Mapterhorn tile ${z}/${x}/${y}: ${res.status}`);
  // no colour management or premultiplying, which would change the heights
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
};

/** Position in pixels of the whole world at zoom `z`. */
function worldPixel([lon, lat]: Position, z: number) {
  const size = TILE_SIZE * 2 ** z;
  const rad = (lat! * Math.PI) / 180;
  return {
    x: ((lon! + 180) / 360) * size,
    y: ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * size,
  };
}

/** The height at a point inside a tile, interpolated between pixel centres. */
export function heightIn(tile: Pixels, px: number, py: number) {
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const x = clamp(px - 0.5, tile.width - 1);
  const y = clamp(py - 0.5, tile.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, tile.width - 1);
  const y1 = Math.min(y0 + 1, tile.height - 1);
  const at = (cx: number, cy: number) => {
    const i = (cy * tile.width + cx) * 4;
    return terrarium(tile.data[i]!, tile.data[i + 1]!, tile.data[i + 2]!);
  };
  const fx = x - x0;
  const fy = y - y0;
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

export type Progress = { done: number; total: number };

/**
 * Samples elevation tiles, keeping those it loaded for the next call. A tile
 * missing at the zoom asked for is looked for at the zooms below.
 */
export function createSampler(load: TileLoader = loadMapterhornTile) {
  const tiles = new Map<string, Promise<Pixels | null>>();
  const tile = (z: number, x: number, y: number, signal?: AbortSignal) => {
    const key = `${z}/${x}/${y}`;
    let pending = tiles.get(key);
    if (!pending) {
      pending = load(z, x, y, signal);
      tiles.set(key, pending);
      // a failed or aborted load is tried again next time
      pending.catch(() => tiles.delete(key));
    }
    return pending;
  };

  return async function sample(
    coords: Position[],
    zoom: number,
    options: {
      signal?: AbortSignal;
      onProgress?: (progress: Progress) => void;
    } = {},
  ): Promise<{ heights: number[]; zooms: number[] }> {
    const heights = new Array<number>(coords.length).fill(NaN);
    const zooms = new Array<number>(coords.length).fill(NaN);
    type Job = { z: number; x: number; y: number; points: number[] };
    const queue: Job[] = [];
    const enqueue = (points: number[], z: number) => {
      const jobs = new Map<string, Job>();
      for (const i of points) {
        const { x, y } = worldPixel(coords[i]!, z);
        const tx = Math.floor(x / TILE_SIZE);
        const ty = Math.floor(y / TILE_SIZE);
        const key = `${tx}/${ty}`;
        const job = jobs.get(key) ?? { z, x: tx, y: ty, points: [] };
        job.points.push(i);
        jobs.set(key, job);
      }
      queue.push(...jobs.values());
    };
    enqueue(
      coords.map((_, i) => i),
      zoom,
    );

    const progress = { done: 0, total: queue.length };
    options.onProgress?.({ ...progress });
    async function work() {
      for (let job = queue.shift(); job; job = queue.shift()) {
        options.signal?.throwIfAborted();
        const pixels = await tile(job.z, job.x, job.y, options.signal);
        if (pixels) {
          for (const i of job.points) {
            const { x, y } = worldPixel(coords[i]!, job.z);
            heights[i] = heightIn(
              pixels,
              x - job.x * TILE_SIZE,
              y - job.y * TILE_SIZE,
            );
            zooms[i] = job.z;
          }
        } else if (job.z > MIN_ZOOM) {
          const before = queue.length;
          enqueue(job.points, job.z - 1);
          progress.total += queue.length - before;
        }
        progress.done++;
        options.onProgress?.({ ...progress });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, work));
    if (heights.some((h) => Number.isNaN(h)))
      throw new Error("Mapterhorn has no elevation for part of the route.");
    return { heights, zooms };
  };
}
