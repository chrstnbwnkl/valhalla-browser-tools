import type { LngLat } from "maplibre-gl";
import { Marker } from "../../shared/map/Marker";
import { Popup } from "../../shared/map/Popup";
import type { ThemeColors } from "../../shared/theme/colors";
import { OptionFields } from "../../shared/valhalla/OptionFields";
import {
  optionState,
  type Location,
  type Option,
} from "../../shared/valhalla/request";
import { START_OPTIONS } from "./request";

export const START_MARKER = "start-marker";

type Props = {
  start: Location | null;
  at: [number, number] | null;
  colors: ThemeColors;
  editing: boolean;
  onEdit: (open: boolean) => void;
  onMove: (lngLat: LngLat) => void;
  onOption: (option: Option, raw: string) => void;
};

/** The start, which can be dragged, with its options in a popup. */
export function RoundTripLayers({
  start,
  at,
  colors,
  editing,
  onEdit,
  onMove,
  onOption,
}: Props) {
  if (!start || !at) return null;
  return (
    <>
      <Marker
        lngLat={at}
        draggable
        className="z-[2]"
        onDragEnd={onMove}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={() => onEdit(true)}
      >
        <div
          className={`${START_MARKER} size-[24px] cursor-grab rounded-full border-3 bg-surface text-center font-mono text-[12px]/[18px] font-bold text-ink`}
          style={{ borderColor: colors.green }}
          title="Drag to move the start, click for its options"
        >
          S
        </div>
      </Marker>
      {editing && (
        <Popup lngLat={at} onClose={() => onEdit(false)}>
          <div
            role="dialog"
            aria-label="Start options"
            className="caption max-h-[60vh] w-[360px] overflow-y-auto"
          >
            <div className="label px-3 pt-2 pr-8">Start</div>
            <OptionFields
              options={START_OPTIONS}
              valueOf={(option) => optionState([start], option.path)}
              onChange={onOption}
            />
          </div>
        </Popup>
      )}
    </>
  );
}
