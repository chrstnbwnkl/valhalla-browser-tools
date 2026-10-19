import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GeoJSON } from "geojson";
import { describe, expect, it, vi } from "vitest";
import { Map as FakeMap } from "../../test/maplibre";
import { BASEMAP_KEY } from "./basemap";
import { MapProvider, useMap } from "./context";
import { fc, point } from "./geo";
import { useGeoJSONSource, useLayer, useMapEvent } from "./hooks";
import { MapView } from "./MapView";
import { Marker } from "./Marker";

const currentMap = () => FakeMap.instances.at(-1)!;

type Props = {
  data: GeoJSON;
  color: string;
  filterIdx: number;
  onClick?: () => void;
  marker?: [number, number];
  hidden?: boolean;
};

function Layers({ data, color, filterIdx, onClick = () => {}, marker }: Props) {
  useGeoJSONSource("things", data);
  useLayer({
    id: "things",
    type: "circle",
    source: "things",
    filter: ["==", ["get", "idx"], filterIdx],
    paint: { "circle-color": color, "circle-radius": 4 },
  });
  useMapEvent("click", onClick);
  return marker && <Marker lngLat={marker}>pin</Marker>;
}

function Outside() {
  return <span>{useMap() ? "loaded" : "loading"}</span>;
}

async function renderMap(props: Props, show = true) {
  const view = (p: Props, s: boolean) => (
    <MapProvider>
      <Outside />
      {s && (
        <MapView options={{ center: [10, 50], zoom: 3 }}>
          {!p.hidden && <Layers {...p} />}
        </MapView>
      )}
    </MapProvider>
  );
  const result = render(view(props, show));
  await screen.findByText("loaded");
  return {
    ...result,
    rerender: (p: Props, s = true) => result.rerender(view(p, s)),
  };
}

const DATA = fc([point([1, 2], { idx: 1 })]);

describe("MapView", () => {
  it("creates the map with the options and the basemap, and shares it once loaded", async () => {
    await renderMap({ data: DATA, color: "red", filterIdx: 1 });
    const map = currentMap();
    expect(map.getCenter()).toMatchObject({ lng: 10, lat: 50 });
    expect(map.getLayer("osm")).toBeDefined();
  });

  it("adds sources and layers, then follows their inputs", async () => {
    const { rerender } = await renderMap({
      data: DATA,
      color: "red",
      filterIdx: 1,
    });
    const map = currentMap();
    expect(map.data("things")).toEqual(DATA);
    expect(map.getLayer("things")).toMatchObject({
      paint: { "circle-color": "red" },
      filter: ["==", ["get", "idx"], 1],
    });

    const next = fc([]);
    rerender({ data: next, color: "blue", filterIdx: 2 });
    expect(map.data("things")).toBe(next);
    expect(map.getLayer("things")).toMatchObject({
      paint: { "circle-color": "blue", "circle-radius": 4 },
      filter: ["==", ["get", "idx"], 2],
    });
  });

  it("calls the latest handler for map events", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = await renderMap({
      data: DATA,
      color: "red",
      filterIdx: 1,
      onClick: first,
    });
    rerender({ data: DATA, color: "red", filterIdx: 1, onClick: second });
    act(() => currentMap().fire("click", {}));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(
      currentMap().listeners.filter((l) => l.type === "click"),
    ).toHaveLength(1);
  });

  it("places markers and moves them with their position", async () => {
    const { rerender } = await renderMap({
      data: DATA,
      color: "red",
      filterIdx: 1,
      marker: [1, 2],
    });
    const [marker] = currentMap().markers;
    expect(marker!.getElement()).toHaveTextContent("pin");
    expect(marker!.getLngLat()).toMatchObject({ lng: 1, lat: 2 });
    rerender({ data: DATA, color: "red", filterIdx: 1, marker: [3, 4] });
    expect(marker!.getLngLat()).toMatchObject({ lng: 3, lat: 4 });
    rerender({ data: DATA, color: "red", filterIdx: 1 });
    expect(currentMap().markers.size).toBe(0);
  });

  it("removes what a component added when it unmounts", async () => {
    const { rerender } = await renderMap({
      data: DATA,
      color: "red",
      filterIdx: 1,
    });
    const map = currentMap();
    rerender({ data: DATA, color: "red", filterIdx: 1, hidden: true });
    expect(map.getLayer("things")).toBeUndefined();
    expect(map.sources.has("things")).toBe(false);
    expect(map.listeners.filter((l) => l.type === "click")).toHaveLength(0);
    expect(map.getLayer("osm")).toBeDefined();
  });

  it("removes the map on unmount without its children tripping over it", async () => {
    const { rerender } = await renderMap({
      data: DATA,
      color: "red",
      filterIdx: 1,
    });
    const map = currentMap();
    rerender({ data: DATA, color: "red", filterIdx: 1 }, false);
    expect(map.removed).toBe(true);
    await screen.findByText("loading");
  });

  it("switches the basemap between grey and colour, remembering it", async () => {
    const user = userEvent.setup();
    await renderMap({ data: DATA, color: "red", filterIdx: 1 });
    const map = currentMap();
    expect(map.getLayer("osm")!.paint).toMatchObject({
      "raster-saturation": -1,
    });
    await user.click(screen.getByRole("checkbox", { name: "Color map" }));
    await waitFor(() =>
      expect(map.getLayer("osm")!.paint).toMatchObject({
        "raster-saturation": 0,
      }),
    );
    expect(localStorage.getItem(BASEMAP_KEY)).toBe("true");
  });
});
