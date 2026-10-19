import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CUSTOM_SERVERS,
  PRESET_SERVERS,
  SERVERS_KEY,
  normalizeServer,
  useServers,
} from "./servers";

describe("normalizeServer", () => {
  it.each([
    ["localhost:8002", "http://localhost:8002"],
    ["127.0.0.1:8002/", "http://127.0.0.1:8002"],
    ["[::1]:8002", "http://[::1]:8002"],
    ["valhalla.example.com", "https://valhalla.example.com"],
    ["  https://example.com/valhalla//  ", "https://example.com/valhalla"],
    ["HTTP://Example.com", "http://example.com"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeServer(input)).toBe(expected);
  });

  it.each(["", "   ", "http://"])("rejects %j", (input) => {
    expect(normalizeServer(input)).toBeNull();
  });
});

describe("stored servers", () => {
  it("keeps only added servers", () => {
    expect(
      CUSTOM_SERVERS.read(JSON.stringify(["http://a", PRESET_SERVERS[0], 3])),
    ).toEqual(["http://a"]);
    expect(CUSTOM_SERVERS.read("not json")).toEqual([]);
  });

  it("starts from the tools' own lists when nothing is shared yet", () => {
    localStorage.setItem(
      "locate-visualizer:servers",
      JSON.stringify({ custom: ["http://a", "http://b"] }),
    );
    localStorage.setItem(
      "route-debugger:servers",
      JSON.stringify({ custom: ["http://b", "http://c"] }),
    );
    expect(CUSTOM_SERVERS.read(null)).toEqual([
      "http://a",
      "http://b",
      "http://c",
    ]);
  });
});

describe("useServers", () => {
  const KEY = "tool:servers";

  it("starts on the first preset", () => {
    const { result } = renderHook(() => useServers(KEY));
    expect(result.current.selected).toBe(PRESET_SERVERS[0]);
    expect(result.current.all).toEqual(PRESET_SERVERS);
    expect(result.current.removable).toBe(false);
  });

  it("adds, selects and forgets servers, and stores them", () => {
    const { result } = renderHook(() => useServers(KEY));
    act(() => result.current.add("http://mine"));
    expect(result.current.selected).toBe("http://mine");
    expect(result.current.removable).toBe(true);
    expect(JSON.parse(localStorage.getItem(SERVERS_KEY)!)).toEqual([
      "http://mine",
    ]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      selected: "http://mine",
    });

    act(() => void result.current.remove());
    expect(result.current.all).toEqual(PRESET_SERVERS);
    expect(result.current.selected).toBe(PRESET_SERVERS[0]);
  });

  it("falls back to the first preset when the stored one is gone", () => {
    localStorage.setItem(KEY, JSON.stringify({ selected: "http://removed" }));
    const { result } = renderHook(() => useServers(KEY));
    expect(result.current.selected).toBe(PRESET_SERVERS[0]);
  });
});
