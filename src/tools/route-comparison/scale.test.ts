import { describe, expect, it } from "vitest";
import { scaleBar } from "./scale";

describe("scaleBar", () => {
  it("shows a round distance in at most 100 px", () => {
    // ~1.2 m per pixel at the equator, zoom 16
    expect(scaleBar(0, 16)).toMatchObject({ label: "100 m" });
    expect(scaleBar(0, 16).width).toBeCloseTo(83.7, 1);
    expect(scaleBar(52.5, 3).label).toBe("500 km");
    for (const zoom of [2, 7.3, 12, 18.5])
      expect(scaleBar(45, zoom).width).toBeLessThanOrEqual(100);
  });
});
