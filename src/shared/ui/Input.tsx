import {
  useEffect,
  useEffectEvent,
  useState,
  type ComponentProps,
} from "react";
import { cn } from "../cn";

const FIELD =
  "w-full rounded-md border border-line-strong bg-surface-raised px-3 text-[15px]/5 font-medium text-ink " +
  "placeholder:text-ink-subtle hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-focus aria-invalid:border-danger";

const MONO = "font-mono text-[14px]/5 font-normal";

export function Input({
  mono,
  className,
  ...props
}: ComponentProps<"input"> & { mono?: boolean }) {
  return (
    <input className={cn(FIELD, "h-9", mono && MONO, className)} {...props} />
  );
}

export function TextArea({
  mono,
  className,
  ...props
}: ComponentProps<"textarea"> & { mono?: boolean }) {
  return (
    <textarea
      className={cn(FIELD, "py-3", mono && MONO, className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(FIELD, "h-9", className)} {...props} />;
}

type CommitInputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange" | "onBlur"
> & {
  value: string;
  onCommit: (value: string) => void;
};

/** Reports its value after a pause in changes, when left, or on Enter. */
export function CommitInput({ value, onCommit, ...props }: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  const [outside, setOutside] = useState(value);
  if (value !== outside) {
    setOutside(value);
    setDraft(value);
  }

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const commitLater = useEffectEvent(commit);
  useEffect(() => {
    const timer = setTimeout(commitLater, 300);
    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      {...props}
    />
  );
}
