import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

vi.mock("maplibre-gl", () => import("./maplibre"));
vi.mock("terra-draw", () => import("./terra-draw"));
vi.mock("terra-draw-maplibre-gl-adapter", () => import("./terra-draw"));

// missing in jsdom
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;
HTMLCanvasElement.prototype.getContext = (() => null) as never;
if (!("showModal" in HTMLDialogElement.prototype))
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.open = true;
    },
    close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });

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
