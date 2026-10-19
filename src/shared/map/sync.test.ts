import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { Map as FakeMap } from "../../test/maplibre";
import { createMapSync } from "./sync";

const map = () =>
  new FakeMap({
    container: document.createElement("div"),
  }) as unknown as MapLibreMap & FakeMap;

describe("createMapSync", () => {
  it("moves every map with the one moved", () => {
    const sync = createMapSync();
    const [a, b, c] = [map(), map(), map()];
    [a, b, c].forEach((m) => sync.add(m));
    a.jumpTo({ center: [13.4, 52.5], zoom: 12 });
    for (const m of [b, c]) {
      expect(m.getCenter()).toMatchObject({ lng: 13.4, lat: 52.5 });
      expect(m.getZoom()).toBe(12);
    }
  });

  it("gives a new map the view the others have", () => {
    const sync = createMapSync();
    const a = map();
    sync.add(a);
    a.jumpTo({ center: [2.35, 48.85], zoom: 9 });
    const b = map();
    sync.add(b);
    expect(b.getCenter()).toMatchObject({ lng: 2.35, lat: 48.85 });
  });

  it("moves the others to a leading map's view", () => {
    const sync = createMapSync();
    const a = map();
    sync.add(a);
    const b = map();
    b.jumpTo({ center: [10, 50], zoom: 4 });
    sync.add(b, true);
    expect(a.getCenter()).toMatchObject({ lng: 10, lat: 50 });
  });

  it("stops moving a removed map", () => {
    const sync = createMapSync();
    const [a, b] = [map(), map()];
    sync.add(a);
    const remove = sync.add(b);
    remove();
    a.jumpTo({ center: [1, 1], zoom: 3 });
    expect(b.getCenter()).not.toMatchObject({ lng: 1, lat: 1 });
    expect(sync.size).toBe(1);
  });

  it("tells about the shared view, and zooms all maps", () => {
    const sync = createMapSync();
    let calls = 0;
    sync.subscribe(() => calls++);
    expect(sync.camera()).toBeNull();
    const [a, b] = [map(), map()];
    const remove = sync.add(a);
    sync.add(b);
    a.jumpTo({ center: [13.4, 52.5], zoom: 10 });
    expect(sync.camera()).toMatchObject({ zoom: 10 });
    sync.zoomIn();
    expect(b.getZoom()).toBe(11);
    expect(sync.camera()).toMatchObject({ zoom: 11 });
    expect(calls).toBeGreaterThan(1);
    remove();
    expect(sync.camera()).not.toBeNull();
  });
});
