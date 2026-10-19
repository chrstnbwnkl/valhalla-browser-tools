import { describe, expect, it } from "vitest";
import {
  NO_FIELDS,
  OPTIONS,
  fieldsFor,
  getOption,
  locationsOf,
  newLocation,
  optionValue,
  parseRequest,
  positionOf,
  withOption,
} from "./request";

const option = (path: string) => OPTIONS.find((o) => o.path === path)!;

describe("parseRequest", () => {
  it("accepts a JSON object", () => {
    expect(parseRequest('{"locations": []}')).toEqual({
      request: { locations: [] },
      error: null,
    });
  });

  it("says why anything else is not a request", () => {
    expect(parseRequest("[1]")).toEqual({
      request: null,
      error: "The request must be a JSON object.",
    });
    expect(parseRequest("{").error).toMatch(/JSON/);
  });
});

describe("locations", () => {
  it("reads only object locations, and only proper positions", () => {
    const request = {
      locations: [{ lat: 1, lon: 2 }, "junk", { lat: "x", lon: 2 }],
    };
    expect(locationsOf(request)).toHaveLength(2);
    expect(locationsOf({ locations: "nope" })).toEqual([]);
    expect(positionOf({ lat: 1, lon: 2 })).toEqual([2, 1]);
    expect(positionOf({ lat: "x", lon: 2 })).toBeNull();
    expect(positionOf("junk")).toBeNull();
  });
});

describe("options", () => {
  it("reads and writes top-level and nested options without touching the original", () => {
    const location = { lat: 1, lon: 2, search_filter: { exclude_toll: true } };
    expect(getOption(location, "search_filter.exclude_toll")).toBe(true);
    expect(getOption(location, "radius")).toBeUndefined();

    const next = withOption(
      withOption(location, "radius", 50),
      "search_filter.min_road_class",
      "primary",
    );
    expect(next).toEqual({
      lat: 1,
      lon: 2,
      radius: 50,
      search_filter: { exclude_toll: true, min_road_class: "primary" },
    });
    expect(location).toEqual({
      lat: 1,
      lon: 2,
      search_filter: { exclude_toll: true },
    });
  });

  it("removes an option, and the group it empties", () => {
    const location = {
      lat: 1,
      lon: 2,
      radius: 5,
      search_filter: { exclude_toll: true },
    };
    expect(
      withOption(
        withOption(location, "radius", undefined),
        "search_filter.exclude_toll",
        undefined,
      ),
    ).toEqual({
      lat: 1,
      lon: 2,
    });
  });

  it("turns input text into values", () => {
    expect(optionValue(option("radius"), "")).toBeUndefined();
    expect(optionValue(option("radius"), "12.5")).toBe(12.5);
    expect(optionValue(option("rank_candidates"), "false")).toBe(false);
    expect(optionValue(option("preferred_side"), "same")).toBe("same");
  });

  it("gives a new location the options the inputs hold, rounded to 6 decimals", () => {
    const fields = {
      values: {
        radius: "20",
        "search_filter.exclude_ramp": "true",
        heading: "",
      },
      mixed: new Set<string>(),
    };
    expect(
      newLocation({ lng: 13.123456789, lat: 52.987654321 }, fields),
    ).toEqual({
      lat: 52.987654,
      lon: 13.123457,
      radius: 20,
      search_filter: { exclude_ramp: true },
    });
  });
});

describe("fieldsFor", () => {
  it("shows what all locations agree on, and marks the rest mixed", () => {
    const request = {
      locations: [
        { lat: 1, lon: 1, radius: 10, preferred_side: "same" },
        { lat: 2, lon: 2, radius: 10, preferred_side: "opposite" },
      ],
    };
    const fields = fieldsFor(request, NO_FIELDS);
    expect(fields.values).toEqual({ radius: "10" });
    expect([...fields.mixed]).toEqual(["preferred_side"]);
  });

  it("keeps the inputs as they are without locations", () => {
    const current = { values: { radius: "5" }, mixed: new Set<string>() };
    expect(fieldsFor({ locations: [] }, current)).toBe(current);
  });
});
