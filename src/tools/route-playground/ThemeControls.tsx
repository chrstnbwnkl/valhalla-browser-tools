import { Select } from "../../shared/ui/Input";
import { Toggle } from "../../shared/ui/Toggle";
import { WayLink } from "../../shared/valhalla/WayLinks";
import { fmt } from "./format";
import type { LegendRow, Scale, ThemeSettings } from "./themes";

type Props = {
  settings: ThemeSettings;
  onChange: (settings: ThemeSettings) => void;
  edgeKeys: string[];
  nodeKeys: string[];
  /** The themes in effect, which may differ from the chosen ones. */
  edgeTheme: string;
  nodeTheme: string;
  edgeScale: Scale | null;
  nodeScale: Scale | null;
};

export function ThemeControls({
  settings,
  onChange,
  edgeKeys,
  nodeKeys,
  edgeTheme,
  nodeTheme,
  edgeScale,
  nodeScale,
}: Props) {
  const set = (change: Partial<ThemeSettings>) =>
    onChange({ ...settings, ...change });
  return (
    <div className="mx-3 mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
      <Toggle
        checked={settings.showEdges}
        onChange={(e) => set({ showEdges: e.target.checked })}
      >
        Edges
      </Toggle>
      <Select
        aria-label="Edge theme"
        className="min-w-0"
        value={edgeTheme}
        onChange={(e) => set({ edgeTheme: e.target.value })}
      >
        <option value="">Edge index</option>
        {edgeKeys.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </Select>
      <Toggle
        aria-label="Edge labels"
        checked={settings.labelEdges}
        onChange={(e) => set({ labelEdges: e.target.checked })}
      >
        labels
      </Toggle>
      {edgeScale && (
        <Legend scale={edgeScale} wayIds={edgeTheme === "way_id"} />
      )}

      <Toggle
        checked={settings.showNodes}
        onChange={(e) => set({ showNodes: e.target.checked })}
      >
        Nodes
      </Toggle>
      <Select
        aria-label="Node theme"
        className="min-w-0"
        value={nodeTheme}
        onChange={(e) => set({ nodeTheme: e.target.value })}
      >
        <option value="">Uniform</option>
        {nodeKeys.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </Select>
      <Toggle
        aria-label="Node labels"
        checked={settings.labelNodes}
        onChange={(e) => set({ labelNodes: e.target.checked })}
      >
        labels
      </Toggle>
      {nodeScale && <Legend scale={nodeScale} />}
    </div>
  );
}

function Legend({ scale, wayIds = false }: { scale: Scale; wayIds?: boolean }) {
  const row = ({ label, count, color }: LegendRow) => (
    <div key={label} className="flex items-center gap-2">
      <i
        className="size-2.5 flex-none rounded-sm"
        style={{ background: color }}
      />
      <span className="min-w-0 flex-1 truncate" title={label}>
        {wayIds && /^\d+$/.test(label) ? <WayLink id={label} /> : label}
      </span>
      <small className="font-mono text-ink-muted">{count}</small>
    </div>
  );
  return (
    <div
      aria-label="Legend"
      className="caption col-span-full max-h-[120px] overflow-y-auto tabular-nums"
    >
      {scale.ramp ? (
        <>
          <div
            className="h-2 rounded-sm"
            style={{
              background: `linear-gradient(to right, ${scale.ramp.join(", ")})`,
            }}
          />
          <div className="flex justify-between font-mono text-ink-muted">
            <span>{fmt(scale.min)}</span>
            <span>{fmt(scale.max)}</span>
          </div>
        </>
      ) : (
        scale.rows.map(row)
      )}
      {scale.missing > 0 &&
        row({
          label: "no value",
          count: scale.missing,
          color: scale.missingColor,
        })}
    </div>
  );
}
