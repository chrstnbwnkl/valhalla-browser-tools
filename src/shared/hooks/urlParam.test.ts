import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readUrlParam, useUrlParam } from "./urlParam";

describe("URL parameter", () => {
  it("reads a parameter of the URL", () => {
    history.replaceState(null, "", "/?json=%7B%7D&other=1");
    expect(readUrlParam("json")).toBe("{}");
    expect(readUrlParam("missing")).toBeNull();
  });

  it("writes the value as the only parameter, without adding history", () => {
    history.replaceState(null, "", "/tool/?old=1#here");
    const before = history.length;
    const { rerender } = renderHook<void, { value: string | null }>(
      ({ value }) => useUrlParam("json", value),
      { initialProps: { value: '{"a":1}' } },
    );
    expect(location.search).toBe("?json=%7B%22a%22%3A1%7D");
    expect(location.pathname).toBe("/tool/");
    expect(location.hash).toBe("#here");

    rerender({ value: null });
    expect(readUrlParam("json")).toBe('{"a":1}');
    expect(history.length).toBe(before);
  });
});
