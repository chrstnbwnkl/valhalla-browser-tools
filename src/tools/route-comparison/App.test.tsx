import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BASEMAP_KEY } from "../../shared/map/basemap";
import { Map as FakeMap } from "../../test/maplibre";
import { App } from "./App";
import osrm from "./fixtures/osrm.json";
import valhalla from "./fixtures/valhalla.json";

type User = ReturnType<typeof userEvent.setup>;

async function add(user: User, response: unknown, label = "") {
  await user.click(screen.getByRole("button", { name: "Add a response" }));
  const dialog = within(
    screen.getByRole("dialog", { name: "Add a route response" }),
  );
  if (label)
    await user.type(dialog.getByRole("textbox", { name: "Label" }), label);
  await user.click(dialog.getByRole("textbox", { name: "Response" }));
  await user.paste(JSON.stringify(response));
  await user.click(dialog.getByRole("button", { name: "Add" }));
}

/** The maps of the panes, oldest first, once loaded. */
async function maps(count: number) {
  await waitFor(() =>
    expect(
      FakeMap.instances.filter((m) => !m.removed && m.sources.has("segments")),
    ).toHaveLength(count),
  );
  return FakeMap.instances.filter((m) => !m.removed);
}

function setup(url = "/") {
  history.replaceState(null, "", url);
  const user = userEvent.setup();
  render(<App />);
  return user;
}

const pane = (name: string) => within(screen.getByRole("region", { name }));

describe("route comparison", () => {
  it("starts empty, waiting for a response", () => {
    setup();
    expect(screen.getByText("Route comparison")).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows a pasted OSRM response with its weights, turn weights and alternative", async () => {
    const user = setup();
    await add(user, osrm);
    const [map] = await maps(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const card = pane("Response 1");
    expect(card.getByText("osrm")).toBeInTheDocument();
    expect(card.getByText("weight (auto)").nextSibling).toHaveTextContent(
      String(osrm.routes[0]!.weight),
    );
    const steps = osrm.routes[0]!.legs[0]!.steps;
    expect(map!.data("segments")!.features.length).toBeGreaterThan(1);
    // a label per step but the arrival
    expect(screen.getAllByTitle(/^step \d+: /)).toHaveLength(steps.length - 1);
    expect(screen.getAllByTitle(/turn_weight$/).length).toBeGreaterThan(0);
    expect(map!.data("alternatives")!.features).toHaveLength(1);
    // the first pane shows its route
    expect(map!.fitted).not.toBeNull();

    await user.selectOptions(
      card.getByRole("combobox", { name: "Route" }),
      "1",
    );
    expect(card.getByText("weight (auto)").nextSibling).toHaveTextContent(
      String(osrm.routes[1]!.weight),
    );
  });

  it("shows a Valhalla response by its maneuvers and their costs", async () => {
    const user = setup();
    await add(user, valhalla);
    await maps(1);
    const card = pane("Response 1");
    expect(card.getByText("valhalla")).toBeInTheDocument();
    expect(card.getByText("cost").nextSibling).toHaveTextContent(
      String(valhalla.trip.summary.cost),
    );
    expect(card.getByText("distance").nextSibling).toHaveTextContent("km");
    const maneuvers = valhalla.trip.legs[0]!.maneuvers;
    expect(screen.getAllByTitle(/^maneuver \d+: /)).toHaveLength(
      maneuvers.length - 1,
    );
    expect(screen.getAllByTitle(/^waypoint \d$/)).toHaveLength(2);
  });

  it("refuses what isn't a route response, keeping the dialog open", async () => {
    const user = setup();
    await add(user, {
      error_code: 171,
      error: "No suitable edges near location",
    });
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("alert")).toHaveTextContent(
      "That is an error response: 171: No suitable edges near location",
    );
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("opens each response on its own map, all moving together", async () => {
    const user = setup();
    await add(user, osrm);
    await maps(1);
    await add(user, valhalla);
    const [first, second] = await maps(2);
    expect(pane("Response 2").getByText("valhalla")).toBeInTheDocument();
    // the new pane shows both routes, and the first follows
    expect(
      second!.fitted!.contains([
        valhalla.trip.locations[0]!.lon,
        valhalla.trip.locations[0]!.lat,
      ]),
    ).toBe(true);
    expect(first!.getCenter()).toEqual(second!.getCenter());

    act(() => second!.jumpTo({ center: [13.39, 52.51], zoom: 15 }));
    expect(first!.getCenter()).toMatchObject({ lng: 13.39, lat: 52.51 });
    expect(first!.getZoom()).toBe(15);
  });

  it("closes a pane, keeping the others as they are", async () => {
    const before = FakeMap.instances.length;
    const user = setup();
    await add(user, osrm);
    await maps(1);
    await add(user, valhalla);
    const [first] = await maps(2);
    await user.click(screen.getByRole("button", { name: "Close Response 1" }));
    expect(
      screen.queryByRole("region", { name: "Response 1" }),
    ).not.toBeInTheDocument();
    expect(first!.removed).toBe(true);
    const [left] = FakeMap.instances.filter((m) => !m.removed);
    expect(left!.data("segments")).toBeDefined();
    // the other map wasn't rebuilt
    expect(FakeMap.instances.slice(before)).toHaveLength(2);
  });

  it("switches the basemap of every pane at once", async () => {
    const user = setup();
    await add(user, osrm);
    await maps(1);
    await add(user, valhalla);
    const all = await maps(2);
    await user.click(screen.getByRole("checkbox", { name: "Color map" }));
    await waitFor(() => {
      for (const map of all)
        expect(map.getLayer("osm")!.paint).toMatchObject({
          "raster-saturation": 0,
        });
    });
    expect(localStorage.getItem(BASEMAP_KEY)).toBe("true");
    expect(screen.getAllByRole("checkbox", { name: "Color map" })).toHaveLength(
      1,
    );
  });

  it("inspects a step from its label", async () => {
    const user = setup();
    await add(user, osrm);
    await maps(1);
    await user.click(screen.getByTitle(/^step 1: /));
    expect(screen.getByRole("dialog", { name: "step 1" })).toHaveTextContent(
      `weight: ${osrm.routes[0]!.legs[0]!.steps[1]!.weight}`,
    );
  });

  it("labels a response when adding it, or afterwards", async () => {
    const user = setup();
    await add(user, osrm, "before");
    await maps(1);
    expect(screen.getByRole("region", { name: "before" })).toBeInTheDocument();

    await user.click(pane("before").getByRole("button", { name: "before" }));
    const field = pane("before").getByRole("textbox", { name: "Label" });
    await user.clear(field);
    await user.type(field, "after{Enter}");
    expect(screen.getByRole("region", { name: "after" })).toBeInTheDocument();

    // an empty label goes back to the default
    await user.click(pane("after").getByRole("button", { name: "after" }));
    await user.clear(pane("after").getByRole("textbox", { name: "Label" }));
    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("region", { name: "Response 1" }),
    ).toBeInTheDocument();
  });

  it("has one set of map controls for all panes", async () => {
    const user = setup();
    expect(
      screen.queryByRole("button", { name: "Zoom in" }),
    ).not.toBeInTheDocument();
    await add(user, osrm);
    await maps(1);
    await add(user, valhalla);
    const all = await maps(2);
    for (const map of all) {
      expect(map.options).toMatchObject({ attributionControl: false });
      expect(map.controls.size).toBe(0);
    }
    expect(screen.getAllByText("OpenStreetMap")).toHaveLength(1);
    expect(screen.getAllByLabelText("Scale")).toHaveLength(1);

    const zoom = all[0]!.getZoom();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    for (const map of all) expect(map.getZoom()).toBe(zoom + 1);
  });

  describe("from a link", () => {
    /** Serves the fixtures at a.test, recording what was asked for. */
    function host() {
      const fetch = vi.fn(async (url: string) => {
        const body = {
          "https://a.test/osrm.json": osrm,
          "https://a.test/valhalla.json": valhalla,
        }[url];
        return { ok: !!body, status: body ? 200 : 404, json: async () => body };
      });
      vi.stubGlobal("fetch", fetch);
      return fetch;
    }

    it("loads the responses it names, in order, with their labels", async () => {
      const fetch = host();
      setup(
        "/?res_2=a.test/osrm.json&res_1=a.test/valhalla.json&label_1=Valhalla",
      );
      expect(screen.getByText("Loading 2 responses…")).toBeInTheDocument();
      await maps(2);
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://a.test/valhalla.json",
        "https://a.test/osrm.json",
      ]);
      expect(pane("Valhalla").getByText("valhalla")).toBeInTheDocument();
      expect(pane("a.test/osrm.json").getByText("osrm")).toBeInTheDocument();
    });

    it("says which failed to load, and shows the others", async () => {
      host();
      setup("/?res_1=a.test/missing.json&res_2=a.test/osrm.json");
      await maps(1);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not load a.test/missing.json: HTTP 404",
      );
      expect(
        screen.getByRole("region", { name: "a.test/osrm.json" }),
      ).toBeInTheDocument();
    });

    it("follows renamed and closed panes, leaving pasted ones out", async () => {
      host();
      const user = setup("/?res_1=a.test/osrm.json&res_2=a.test/valhalla.json");
      await maps(2);
      await add(user, osrm, "pasted");
      await maps(3);
      expect(location.search).toBe(
        "?res_1=a.test/osrm.json&res_2=a.test/valhalla.json",
      );

      await user.click(
        pane("a.test/valhalla.json").getByRole("button", {
          name: "a.test/valhalla.json",
        }),
      );
      await user.clear(screen.getByRole("textbox", { name: "Label" }));
      await user.type(
        screen.getByRole("textbox", { name: "Label" }),
        "Valhalla{Enter}",
      );
      expect(location.search).toBe(
        "?res_1=a.test/osrm.json&res_2=a.test/valhalla.json&label_2=Valhalla",
      );

      await user.click(
        screen.getByRole("button", { name: "Close a.test/osrm.json" }),
      );
      expect(location.search).toBe(
        "?res_1=a.test/valhalla.json&label_1=Valhalla",
      );
    });
  });
});
