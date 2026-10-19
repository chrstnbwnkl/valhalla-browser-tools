import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

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

afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState(null, "", "/");
});
