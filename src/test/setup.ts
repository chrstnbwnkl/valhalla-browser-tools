import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// MapLibre needs WebGL, which jsdom lacks; tests get a fake that records what is put on the map
vi.mock("maplibre-gl", () => import("./maplibre"));

// jsdom has neither media queries nor canvas drawing
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;
HTMLCanvasElement.prototype.getContext = (() => null) as never;

afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState(null, "", "/");
});
