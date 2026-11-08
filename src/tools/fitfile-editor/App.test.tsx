import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DRAFT_KEY, createDraft, parseDraft } from "../../shared/fitDraft";
import { MapProvider } from "../../shared/map/context";
import { decodePolyline } from "../../shared/map/geo";
import type { RouteResponse } from "../../shared/valhalla/osrm";
import { Map as FakeMap, LngLat } from "../../test/maplibre";
import route from "../route-playground/fixtures/route.json";
import leg0 from "../route-playground/fixtures/trace-leg0.json";
import leg1 from "../route-playground/fixtures/trace-leg1.json";
import { App } from "./App";

const SERVER = "https://valhalla.example";

function storeFixtureDraft() {
  const draft = createDraft({
    server: SERVER,
    costing: "bicycle",
    sent: { costing: "bicycle", locations: [] },
    route: (route as RouteResponse).routes[0]!,
  });
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

const stored = () => parseDraft(JSON.parse(localStorage.getItem(DRAFT_KEY)!))!;

/** Answers /height with a slope and trace_attributes with the recorded legs. */
function serve({ tiles = 404 }: { tiles?: number } = {}) {
  let legs = 0;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://tiles.mapterhorn.com"))
      return { ok: false, status: tiles, json: async () => ({}) };
    const body = JSON.parse(init!.body as string);
    if (url.endsWith("/height")) {
      const coords = decodePolyline(body.encoded_polyline);
      return {
        json: async () => ({ height: coords.map((_, i) => 30 + i * 0.5) }),
      };
    }
    return { json: async () => [leg0, leg1][legs++ % 2] };
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function setup() {
  const user = userEvent.setup();
  render(
    <MapProvider>
      <App />
    </MapProvider>,
  );
  await screen.findByRole("list", { name: "Course points" });
  return { user, map: FakeMap.instances.at(-1)! };
}

const rows = () =>
  within(screen.getByRole("list", { name: "Course points" })).getAllByRole(
    "listitem",
  );

describe("fitfile editor", () => {
  it("says where a course comes from when there is none", () => {
    render(
      <MapProvider>
        <App />
      </MapProvider>,
    );
    expect(screen.getByText(/Nothing to edit/)).toBeInTheDocument();
  });

  it("lists the course points and loads elevation and edges", async () => {
    storeFixtureDraft();
    const fetch = serve();
    await setup();
    expect(rows()).toHaveLength(12);
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: /Elevation profile/ }),
      ).toBeVisible(),
    );
    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls).toContain(`${SERVER}/height`);
    expect(urls).toContain(`${SERVER}/trace_attributes`);
    // the slope climbs the whole way
    expect(screen.getByText("ascent").nextSibling).not.toHaveTextContent("–");
  });

  it("edits, deletes and adds course points, and keeps them", async () => {
    storeFixtureDraft();
    serve();
    const { user, map } = await setup();
    const name = screen.getByRole("textbox", {
      name: "Name of course point 2",
    });
    await user.clear(name);
    await user.type(name, "Behren{Enter}");
    expect(stored().points[1]!.name).toBe("Behren");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Type of course point 2" }),
      "Danger",
    );
    expect(stored().points[1]!.type).toBe(5);

    await user.click(
      screen.getByRole("button", { name: "Delete course point 3" }),
    );
    expect(rows()).toHaveLength(11);

    act(() =>
      map.fire("contextmenu", {
        lngLat: new LngLat(13.3895, 52.5156),
        point: { x: 0, y: 0 },
        originalEvent: { preventDefault() {}, clientX: 10, clientY: 10 },
      }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Add course point here" }),
    );
    expect(rows()).toHaveLength(12);
    expect(stored().points).toHaveLength(12);
  });

  it("moves turns early and takes the suggestion off the list", async () => {
    const draft = storeFixtureDraft();
    serve();
    const { user } = await setup();
    const group = await screen.findByRole("region", {
      name: "Earlier turn alerts",
    });
    await user.click(within(group).getByRole("button", { name: "Move all" }));
    const before = draft.points.find((p) => p.type === 6)!;
    const after = stored().points.find((p) => p.id === before.id)!;
    expect(after.distance).toBeCloseTo(before.distance - 100, 0);
    expect(
      screen.queryByRole("region", { name: "Earlier turn alerts" }),
    ).toBeNull();
    expect(stored().dismissed.length).toBeGreaterThan(0);
  });

  it("downloads a FIT course", async () => {
    storeFixtureDraft();
    serve();
    const { user } = await setup();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:fit";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    await waitFor(() =>
      expect(screen.getByText("ascent").nextSibling).not.toHaveTextContent("–"),
    );
    await user.click(screen.getByRole("button", { name: "Download .fit" }));
    expect(click).toHaveBeenCalled();
    const bytes = new Uint8Array(await blobs[0]!.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe(".FIT");
    click.mockRestore();
  });

  it("asks Mapterhorn for tiles, down the zooms where there are none", async () => {
    storeFixtureDraft();
    const fetch = serve({ tiles: 404 });
    const { user } = await setup();
    await user.click(screen.getByRole("radio", { name: "Mapterhorn" }));
    expect(
      await screen.findByText(/Mapterhorn has no elevation/),
    ).toBeInTheDocument();
    const tiles = fetch.mock.calls
      .map(([url]) => url)
      .filter((url) => url.startsWith("https://tiles.mapterhorn.com"));
    expect(tiles.some((url) => url.includes("/16/"))).toBe(true);
    expect(tiles.some((url) => url.includes("/12/"))).toBe(true);
    expect(screen.getByRole("link", { name: "© Mapterhorn" })).toBeVisible();
  });
});
