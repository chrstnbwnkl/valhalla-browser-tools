import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
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

describe("useServers", () => {
  it("starts on the first preset", () => {
    const { result } = renderHook(() => useServers());
    expect(result.current.selected).toBe(PRESET_SERVERS[0]);
    expect(result.current.all).toEqual(PRESET_SERVERS);
    expect(result.current.removable).toBe(false);
  });

  it("adds, selects and forgets servers, and stores them", () => {
    const { result } = renderHook(() => useServers());
    act(() => result.current.add("http://mine"));
    expect(result.current.selected).toBe("http://mine");
    expect(result.current.removable).toBe(true);
    expect(JSON.parse(localStorage.getItem(SERVERS_KEY)!)).toEqual({
      added: ["http://mine"],
      selected: "http://mine",
    });

    act(() => void result.current.remove());
    expect(result.current.all).toEqual(PRESET_SERVERS);
    expect(result.current.selected).toBe(PRESET_SERVERS[0]);
  });

  it("ignores stored junk", () => {
    localStorage.setItem(
      SERVERS_KEY,
      JSON.stringify({ added: ["http://a", 3], selected: "http://gone" }),
    );
    const { result } = renderHook(() => useServers());
    expect(result.current.all).toEqual([...PRESET_SERVERS, "http://a"]);
    expect(result.current.selected).toBe(PRESET_SERVERS[0]);
  });
});
