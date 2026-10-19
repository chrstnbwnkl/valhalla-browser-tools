import type { Position } from "geojson";
import type { Json } from "../valhalla/request";
import { WayLinks } from "../valhalla/WayLinks";
import { Popup } from "./Popup";

/** An object's fields, one per line, with its ways linked. */
export function InspectPopup({
  title,
  object,
  position,
  onClose,
}: {
  title: string;
  object: Json;
  position: Position;
  onClose: () => void;
}) {
  const body = Object.entries(object)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  return (
    <Popup lngLat={position as [number, number]} onClose={onClose}>
      <pre
        role="dialog"
        aria-label={title}
        className="code m-0 max-h-80 max-w-[360px] overflow-auto p-3 pr-8 whitespace-pre-wrap wrap-anywhere"
      >
        <WayLinks text={`${title}\n${body}`} />
      </pre>
    </Popup>
  );
}
