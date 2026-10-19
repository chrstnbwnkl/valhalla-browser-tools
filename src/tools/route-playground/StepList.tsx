import type { Position } from "geojson";
import { cn } from "../../shared/cn";
import { useScrollToRow } from "../../shared/hooks/useScrollToRow";
import { Badge } from "../../shared/ui/Badge";
import { fmt } from "./format";
import { ACTIVE_ROW, LEG, METRICS, ROW, SWATCH } from "./lists";
import type { FlatStep, Route } from "./routes";

type Props = {
  route: Route;
  steps: FlatStep[];
  highlighted: number | null;
  onHover: (idx: number | null) => void;
  onFocus: (coords: Position[]) => void;
};

/** The steps of each leg with their weights, checking they add up to the leg's. */
export function StepList({
  route,
  steps,
  highlighted,
  onHover,
  onFocus,
}: Props) {
  const rowRef = useScrollToRow(highlighted);
  // the weight so far, after each step
  const totals = steps.reduce<number[]>(
    (sums, s) => [...sums, (sums.at(-1) ?? 0) + (s.step.weight ?? 0)],
    [],
  );

  return (
    <ol aria-label="Steps" className="m-0 list-none border-t border-line p-0">
      {(route.legs ?? []).map((leg, legIdx) => {
        const legSteps = steps.filter((s) => s.legIdx === legIdx);
        const sum = legSteps.reduce(
          (total, s) => total + (s.step.weight ?? 0),
          0,
        );
        const matches = Math.abs(sum - (leg.weight ?? 0)) < 0.01;
        return [
          <li key={`leg:${legIdx}`} className={LEG}>
            Leg {legIdx} · weight {fmt(leg.weight)}
            <Badge tone={matches ? "green" : "danger"}>
              {matches ? "= Σ steps" : `≠ Σ steps ${fmt(sum)}`}
            </Badge>
          </li>,
          ...legSteps.map((s) => {
            const { step } = s;
            const turns = (step.intersections ?? []).reduce(
              (total, intersection) => total + (intersection.turn_weight ?? 0),
              0,
            );
            const maneuver = [step.maneuver?.type, step.maneuver?.modifier]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={s.idx}
                ref={rowRef(s.idx)}
                className={cn(ROW, s.idx === highlighted && ACTIVE_ROW)}
                onMouseEnter={() => onHover(s.idx)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onFocus(s.coords)}
              >
                <span className={cn(SWATCH, "bg-green")} />
                <div className="min-w-0 flex-1 font-bold">
                  {step.maneuver?.instruction ?? step.name ?? ""}
                  <small className="caption block text-ink-muted">
                    #{s.idx} {maneuver}
                    {step.ref ? ` · ref ${step.ref}` : ""}
                  </small>
                </div>
                <div className={METRICS}>
                  <b>{fmt(step.weight)}</b>
                  <small className="block text-ink-muted">
                    Σ {fmt(totals[s.idx])}
                  </small>
                  {turns > 0 && (
                    <small className="block text-amber-ink">
                      turns {fmt(turns)}
                    </small>
                  )}
                  <small className="block text-ink-muted">
                    {fmt(step.duration, " s")} · {fmt(step.distance, " m")}
                  </small>
                </div>
              </li>
            );
          }),
        ];
      })}
    </ol>
  );
}
