import { describe, expect, it, vi } from "vitest";
import { createSampler, heightIn, terrarium, type Pixels } from "./mapterhorn";

/** A tile of one height, encoded as terrarium. */
function flat(height: number, size = 512): Pixels {
  const v = height + 32768;
  const r = Math.floor(v / 256);
  const g = Math.floor(v % 256);
  const b = Math.round((v % 1) * 256);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
  return { width: size, height: size, data };
}

describe("terrarium", () => {
  it("decodes heights", () => {
    expect(terrarium(128, 0, 0)).toBe(0);
    expect(terrarium(128, 100, 128)).toBe(100.5);
    expect(terrarium(127, 255, 0)).toBe(-1);
  });

  it("interpolates between pixel centres", () => {
    const tile: Pixels = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([128, 0, 0, 255, 128, 10, 0, 255]),
    };
    expect(heightIn(tile, 0.5, 0.5)).toBe(0);
    expect(heightIn(tile, 1.5, 0.5)).toBe(10);
    expect(heightIn(tile, 1, 0.5)).toBe(5);
  });
});

describe("createSampler", () => {
  const coords = [
    [13.389, 52.5156],
    [13.39, 52.516],
  ];

  it("samples the zoom asked for and keeps the tiles", async () => {
    const load = vi.fn(async () => flat(42.5));
    const sample = createSampler(load);
    const { heights, zooms } = await sample(coords, 16);
    expect(heights).toEqual([42.5, 42.5]);
    expect(zooms).toEqual([16, 16]);
    const calls = load.mock.calls.length;
    await sample(coords, 16);
    expect(load).toHaveBeenCalledTimes(calls);
  });

  it("falls back to lower zooms where a tile is missing", async () => {
    const load = vi.fn(async (z: number) => (z > 14 ? null : flat(7)));
    const progress = vi.fn();
    const { heights, zooms } = await createSampler(load)(coords, 16, {
      onProgress: progress,
    });
    expect(heights).toEqual([7, 7]);
    expect(zooms).toEqual([14, 14]);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ done: expect.any(Number) }),
    );
    const last = progress.mock.calls.at(-1)![0];
    expect(last.done).toBe(last.total);
  });

  it("fails where there is no tile at any zoom", async () => {
    await expect(createSampler(async () => null)(coords, 8)).rejects.toThrow(
      /no elevation/,
    );
  });
});
