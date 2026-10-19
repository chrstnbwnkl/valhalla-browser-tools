import { describe, expect, it } from "vitest";
import type { ThemeColors } from "../../shared/theme/colors";
import { routeEdges } from "./edges";
import leg0 from "./fixtures/trace-leg0.json";
import {
  DEFAULT_THEMES,
  makeScale,
  scalar,
  themeEdges,
  themeKeys,
} from "./themes";

// a distinct hex colour per token
const colors = new Proxy(
  {},
  {
    get: (_, name) => {
      if (name === "surface") return "#000000";
      if (name === "ink") return "#ffffff";
      let hash = 0;
      for (const char of String(name))
        hash = (hash * 31 + char.charCodeAt(0)) & 0xffffff;
      return `#${hash.toString(16).padStart(6, "0")}`;
    },
  },
) as unknown as ThemeColors;

describe("scalar", () => {
  it("joins flat lists and objects, counts lists of objects", () => {
    expect(scalar(["A", "B"])).toBe("A / B");
    expect(scalar({ country: "DE", state: "BE" })).toBe("DE / BE");
    expect(scalar([{}, {}])).toBe(2);
    expect(scalar({ deep: {} })).toBeUndefined();
    expect(scalar(null)).toBeUndefined();
    expect(scalar(false)).toBe(false);
  });

  it("offers the keys that can be themed", () => {
    expect(
      themeKeys([
        { b: 1, a: "x", begin_shape_index: 0, deep: { x: {} } },
        undefined,
      ]),
    ).toEqual(["a", "b"]);
  });
});

describe("makeScale", () => {
  it("ramps numbers from min to max", () => {
    const scale = makeScale(
      "speed",
      [10, 30, undefined],
      ["surface", "ink"],
      colors,
    );
    expect(scale.ramp).toBeDefined();
    expect(scale.color(10)).toBe("rgb(0, 0, 0)");
    expect(scale.color(30)).toBe("rgb(255, 255, 255)");
    expect(scale.color(20)).toBe("rgb(128, 128, 128)");
    expect(scale.color(undefined)).toBe(colors.line);
    expect(scale.missing).toBe(1);
  });

  it("ranks categories by frequency and groups the rest as other", () => {
    const values = ["a", "a", "b", "c", "d", "e", "f", "g"];
    const scale = makeScale("use", values, [], colors);
    if (scale.ramp) throw new Error("expected categories");
    expect(scale.rows.map((r) => [r.label, r.count])).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 1],
      ["d", 1],
      ["e", 1],
      ["other (2 values)", 2],
    ]);
    expect(scale.color("g")).toBe(colors["ink-subtle"]);
  });

  it("treats ids as categories and true/false as on/off", () => {
    expect(makeScale("way_id", [1, 2], [], colors).ramp).toBeUndefined();
    const flags = makeScale("toll", [true, false], [], colors);
    expect(flags.color(true)).toBe(colors.green);
    expect(flags.color(false)).toBe(colors["ink-subtle"]);
  });
});

describe("themeEdges", () => {
  const edges = routeEdges([{ path: leg0, snapped: false }]);

  it("labels by index and colours plainly by default", () => {
    const themed = themeEdges(edges, DEFAULT_THEMES, colors);
    expect(themed.edgeTheme).toBe("");
    expect(themed.edges[3]).toMatchObject({
      label: "#3",
      color: colors.green,
      nodeColor: colors.surface,
    });
    expect(themed.edgeKeys).toContain("road_class");
  });

  it("colours and labels by the chosen attributes, ignoring ones these edges lack", () => {
    const themed = themeEdges(
      edges,
      { ...DEFAULT_THEMES, edgeTheme: "road_class", nodeTheme: "nope" },
      colors,
    );
    expect(themed.edgeTheme).toBe("road_class");
    expect(themed.nodeTheme).toBe("");
    expect(themed.edges[0]!.label).toBe(String(leg0.edges[0]!.road_class));
    expect(themed.edgeScale).not.toBeNull();
  });
});
