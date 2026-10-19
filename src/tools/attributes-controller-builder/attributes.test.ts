import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFF,
  GROUPS,
  KNOWN,
  filterJson,
  orderedSelection,
  sections,
} from "./attributes";

describe("attribute data", () => {
  it("lists every attribute once", () => {
    const all = GROUPS.flatMap((group) => [...group.on, ...group.off]);
    expect(new Set(all).size).toBe(all.length);
    expect(KNOWN.size).toBe(all.length);
  });

  it("marks only the off-by-default ones", () => {
    expect(DEFAULT_OFF.has("edge.elevation")).toBe(true);
    expect(DEFAULT_OFF.has("edge.names")).toBe(false);
  });
});

describe("sections", () => {
  it("keeps the groups in order and drops empty ones", () => {
    const result = sections(
      new Set(),
      (name) => name.startsWith("admin.") || name === "shape",
    );
    expect(result).toEqual([
      { name: "top level", attributes: ["shape"] },
      {
        name: "admin",
        attributes: [
          "admin.country_code",
          "admin.country_text",
          "admin.state_code",
          "admin.state_text",
        ],
      },
    ]);
  });

  it("puts unknown selected attributes under custom", () => {
    const selected = new Set(["edge.names", "my.attribute"]);
    expect(sections(selected, (name) => selected.has(name))).toEqual([
      { name: "edge", attributes: ["edge.names"] },
      { name: "custom", attributes: ["my.attribute"] },
    ]);
  });
});

describe("output", () => {
  it("orders the selection like Valhalla, custom last", () => {
    expect(
      orderedSelection(new Set(["zzz", "shape", "edge.length", "edge.names"])),
    ).toEqual(["edge.names", "edge.length", "shape", "zzz"]);
  });

  it("builds the filters parameter", () => {
    expect(
      JSON.parse(filterJson(new Set(["shape", "edge.names"]), "exclude")),
    ).toEqual({
      filters: { attributes: ["edge.names", "shape"], action: "exclude" },
    });
  });
});
