import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

vi.mock("maplibre-gl", () => import("./maplibre"));

// missing in jsdom
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;
HTMLCanvasElement.prototype.getContext = (() => null) as never;

// tests that send requests stub fetch with a canned response; any other fetch fails the test
const offline = vi.fn(() => Promise.reject(new Error("no network in tests")));
beforeEach(() => {
  offline.mockClear();
  vi.stubGlobal("fetch", offline);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState(null, "", "/");
  expect(offline, "fetch without a stubbed response").not.toHaveBeenCalled();
});
