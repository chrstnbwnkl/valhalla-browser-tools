import type { Position } from "geojson";
import { Popup } from "../../shared/map/Popup";
import { Button } from "../../shared/ui/Button";
import { CommitInput } from "../../shared/ui/Input";
import { OptionFields } from "../../shared/valhalla/OptionFields";
import {
  optionState,
  type Location,
  type Option,
} from "../../shared/valhalla/request";
import { ROUTE_OPTIONS } from "./request";

const at = (position: Position) => position as [number, number];

export function FactorPopup({
  factor,
  position,
  onFactor,
  onDelete,
  onClose,
}: {
  factor: number | null;
  position: Position;
  onFactor: (factor: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Popup lngLat={at(position)} onClose={onClose}>
      <div
        role="dialog"
        aria-label="Cost line"
        className="flex items-end gap-2 p-3 pr-8"
      >
        <label className="grid gap-1">
          <span className="code">factor</span>
          <CommitInput
            mono
            autoFocus
            aria-label="factor"
            type="number"
            step="any"
            min={0}
            className="w-[100px]"
            value={factor === null ? "" : String(factor)}
            onCommit={(raw) => raw !== "" && onFactor(Number(raw))}
          />
        </label>
        <Button variant="danger" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Popup>
  );
}

export function WaypointPopup({
  index,
  location,
  position,
  onOption,
  onClose,
}: {
  index: number;
  location: Location;
  position: [number, number];
  onOption: (option: Option, raw: string) => void;
  onClose: () => void;
}) {
  return (
    <Popup lngLat={position} onClose={onClose}>
      <div
        role="dialog"
        aria-label={`Waypoint ${index + 1} options`}
        className="caption max-h-[60vh] w-[360px] overflow-y-auto"
      >
        <div className="label px-3 pt-2 pr-8">Waypoint {index + 1}</div>
        <OptionFields
          options={ROUTE_OPTIONS}
          valueOf={(option) => optionState([location], option.path)}
          onChange={onOption}
        />
      </div>
    </Popup>
  );
}
