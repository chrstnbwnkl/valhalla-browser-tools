import { describe, expect, it } from "vitest";
import { COSTINGS, costingOptions } from "./costing";

describe("costing options", () => {
  it("lists a costing's own options before the shared ones", () => {
    const options = costingOptions("auto");
    const groups = [...new Set(options.map((o) => o.group))];
    expect(groups).toEqual(["auto", "all costings"]);
    expect(options.find((o) => o.path === "use_tolls")?.group).toBe("auto");
    expect(options.find((o) => o.path === "exclude_bridges")).toMatchObject({
      group: "all costings",
      values: ["true", "false"],
      hint: "false",
    });
  });

  it("explains the range and default in the tooltip", () => {
    const useTolls = costingOptions("auto").find(
      (o) => o.path === "use_tolls",
    )!;
    expect(useTolls.title).toMatch(/\(0–1\)$/);
    expect(useTolls.hint).toBe("0.5");
  });

  it("only has the shared options for an unknown costing", () => {
    expect(new Set(costingOptions("custom").map((o) => o.group))).toEqual(
      new Set(["all costings"]),
    );
    expect(COSTINGS).toContain("auto");
  });
});
