import { describe, expect, it } from "vitest";
import { rects, withPane, withoutPane, type Layout } from "./layout";

describe("layout", () => {
  it("splits the newest pane, side by side first, then stacked", () => {
    let layout: Layout | null = null;
    layout = withPane(layout, 1, 0);
    expect(layout).toEqual({ pane: 1 });
    layout = withPane(layout, 2, 1);
    expect(layout).toEqual({
      split: "row",
      first: { pane: 1 },
      second: { pane: 2 },
    });
    layout = withPane(layout, 3, 2);
    expect(layout).toEqual({
      split: "row",
      first: { pane: 1 },
      second: { split: "column", first: { pane: 2 }, second: { pane: 3 } },
    });
  });

  it("gives a closed pane's room to its sibling", () => {
    const layout: Layout = {
      split: "row",
      first: { pane: 1 },
      second: { split: "column", first: { pane: 2 }, second: { pane: 3 } },
    };
    expect(withoutPane(layout, 2)).toEqual({
      split: "row",
      first: { pane: 1 },
      second: { pane: 3 },
    });
    expect(withoutPane(layout, 1)).toEqual({
      split: "column",
      first: { pane: 2 },
      second: { pane: 3 },
    });
    expect(withoutPane({ pane: 1 }, 1)).toBeNull();
  });

  it("places each pane in its part of the screen", () => {
    const layout: Layout = {
      split: "row",
      first: { pane: 1 },
      second: { split: "column", first: { pane: 2 }, second: { pane: 3 } },
    };
    expect(Object.fromEntries(rects(layout))).toEqual({
      1: { x: 0, y: 0, width: 0.5, height: 1 },
      2: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      3: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    });
    expect(rects(null).size).toBe(0);
  });
});
