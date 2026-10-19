import type { ComponentProps } from "react";
import { cn } from "../cn";

export function Toggle({
  className,
  children,
  title,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 font-sans text-[14px]/5 font-bold",
        className,
      )}
      title={title}
    >
      <input type="checkbox" className="peer sr-only" {...props} />
      <span
        aria-hidden
        className={cn(
          "relative h-[18px] w-8 flex-none rounded-full border border-line-strong bg-surface-sunken transition-colors",
          "after:absolute after:top-0.5 after:left-0.5 after:size-3 after:rounded-full after:bg-ink-muted",
          "after:transition-[translate,background-color]",
          "peer-checked:border-green peer-checked:bg-green peer-checked:after:translate-x-3.5 peer-checked:after:bg-on-green",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
        )}
      />
      {children}
    </label>
  );
}
