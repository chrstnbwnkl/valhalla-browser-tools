import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VIEWS_KEY, useViews, withView, type View } from "./views";

const berlin: View = { name: "Berlin", center: [13.4, 52.5], zoom: 11 };
const paris: View = { name: "Paris", center: [2.35, 48.85], zoom: 12 };

describe("views", () => {
  it("drops stored entries that are not views", () => {
    localStorage.setItem(
      VIEWS_KEY,
      JSON.stringify([
        berlin,
        { name: "x" },
        { name: "y", center: ["a", 1], zoom: 3 },
        null,
      ]),
    );
    expect(renderHook(() => useViews()).result.current[0]).toEqual([berlin]);
  });

  it("appends a new name and replaces an existing one in place", () => {
    expect(withView([berlin], paris)).toEqual([berlin, paris]);
    const moved = { ...berlin, zoom: 5 };
    expect(withView([berlin, paris], moved)).toEqual([moved, paris]);
  });
});
