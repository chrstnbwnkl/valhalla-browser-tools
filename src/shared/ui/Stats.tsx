import type { ReactNode } from "react";
import { cn } from "../cn";

export function Stats({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-6 rounded-lg border border-line bg-surface-raised px-4 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A figure; the unit is left out when there is no value. */
export function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[13px]/[18px] font-bold text-ink-muted">
        {label}
      </span>
      <b className="code">
        {value}
        {unit && value !== "–" && (
          <small className="text-ink-muted"> {unit}</small>
        )}
      </b>
    </div>
  );
}
