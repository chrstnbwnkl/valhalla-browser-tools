import type { ReactNode } from "react";
import { cn } from "../cn";

const TONES = {
  plain: "bg-surface-sunken text-ink-muted",
  green: "bg-green-soft text-green-ink",
  magenta: "bg-magenta-soft text-magenta-ink",
  amber: "bg-amber-soft text-amber-ink",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "plain",
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-sm px-2 font-sans text-[12px]/[22px] font-bold",
        TONES[tone],
      )}
    >
      {tone !== "plain" && (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
