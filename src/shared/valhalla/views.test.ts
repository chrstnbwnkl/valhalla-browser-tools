import { describe, expect, it } from "vitest";
import { VIEWS, withView, type View } from "./views";

const berlin: View = { name: "Berlin", center: [13.4, 52.5], zoom: 11 };
const paris: View = { name: "Paris", center: [2.35, 48.85], zoom: 12 };

describe("stored views", () => {
  it("drops what is not a view", () => {
    const stored = JSON.stringify([
      berlin,
      { name: "x" },
      { name: "y", center: ["a", 1], zoom: 3 },
      null,
    ]);
    expect(VIEWS.read(stored)).toEqual([berlin]);
    expect(VIEWS.read("{")).toEqual([]);
  });

  it("starts from the tools' own views when nothing is shared yet, the first of a name winning", () => {
    localStorage.setItem("locate-visualizer:views", JSON.stringify([berlin]));
    localStorage.setItem(
      "route-debugger:views",
      JSON.stringify([{ ...berlin, zoom: 3 }, paris]),
    );
    expect(VIEWS.read(null)).toEqual([berlin, paris]);
  });
});

describe("withView", () => {
  it("appends a new name and replaces an existing one in place", () => {
    expect(withView([berlin], paris)).toEqual([berlin, paris]);
    const moved = { ...berlin, zoom: 5 };
    expect(withView([berlin, paris], moved)).toEqual([moved, paris]);
  });
});
