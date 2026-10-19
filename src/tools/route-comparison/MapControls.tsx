import { useSyncExternalStore } from "react";
import type { MapSync } from "../../shared/map/sync";
import { scaleBar } from "./scale";

const BUTTON =
  "grid size-[29px] cursor-pointer place-items-center text-[18px]/none text-ink hover:bg-surface-sunken";

/** Zoom, scale and attribution once for all panes, lower right. */
export function MapControls({ sync }: { sync: MapSync }) {
  const camera = useSyncExternalStore(sync.subscribe, sync.camera);
  if (!camera) return null;
  const scale = scaleBar(camera.center.lat, camera.zoom);
  return (
    <div className="absolute right-3 bottom-3 z-[4] flex flex-col items-end gap-2">
      <div className="flex flex-col overflow-hidden rounded-lg bg-surface-raised shadow-float">
        <button
          type="button"
          aria-label="Zoom in"
          className={BUTTON}
          onClick={sync.zoomIn}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          className={`${BUTTON} border-t border-line`}
          onClick={sync.zoomOut}
        >
          −
        </button>
      </div>
      <div
        aria-label="Scale"
        className="border-2 border-t-0 border-ink-muted bg-surface-raised px-1 font-mono text-[10px]/4 text-ink"
        style={{ width: scale.width }}
      >
        {scale.label}
      </div>
      <div className="rounded-sm bg-surface-raised px-1.5 text-[12px]/4 font-medium text-ink-muted [&_a]:text-inherit">
        <a href="https://maplibre.org/" target="_blank" rel="noopener">
          MapLibre
        </a>{" "}
        | ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener"
        >
          OpenStreetMap
        </a>{" "}
        contributors
      </div>
    </div>
  );
}
