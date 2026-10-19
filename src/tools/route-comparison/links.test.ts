import { describe, expect, it, vi } from "vitest";
import { load, resolveUrl, searchFor, sourcesFrom } from "./links";
import valhalla from "./fixtures/valhalla.json";

describe("links", () => {
  it("reads the responses a link asks for, in order, with their labels", () => {
    expect(
      sourcesFrom(
        "?res_2=example.com/b.json&res_1=example.com/a.json&label_2=after&other=1",
      ),
    ).toEqual([
      { url: "example.com/a.json", label: undefined },
      { url: "example.com/b.json", label: "after" },
    ]);
    expect(sourcesFrom("")).toEqual([]);
  });

  it("writes them back, renumbered and readable", () => {
    const search = searchFor([
      { url: "https://example.com/a.json" },
      { url: "example.com/b.json", label: "before & after" },
    ]);
    expect(search).toBe(
      "?res_1=https://example.com/a.json&res_2=example.com/b.json&label_2=before+%26+after",
    );
    expect(sourcesFrom(search)).toEqual([
      { url: "https://example.com/a.json", label: undefined },
      { url: "example.com/b.json", label: "before & after" },
    ]);
    expect(searchFor([])).toBe("");
  });

  it("resolves addresses as written", () => {
    const base = "https://tools.example/route-comparison/";
    expect(resolveUrl("http://a.test/1.json", base)).toBe(
      "http://a.test/1.json",
    );
    expect(resolveUrl("example.com/1.json", base)).toBe(
      "https://example.com/1.json",
    );
    expect(resolveUrl("./runs/1.json", base)).toBe(
      "https://tools.example/route-comparison/runs/1.json",
    );
    expect(resolveUrl("/runs/1.json", base)).toBe(
      "https://tools.example/runs/1.json",
    );
  });

  it("loads a response, saying what went wrong where", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => valhalla })),
    );
    expect((await load({ url: "example.com/1.json" })).format).toBe("valhalla");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    await expect(load({ url: "example.com/1.json" })).rejects.toThrow(
      "Could not load example.com/1.json: HTTP 404",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ hello: 1 }) })),
    );
    await expect(load({ url: "example.com/1.json" })).rejects.toThrow(
      "example.com/1.json: That is not a /route response",
    );
  });
});
