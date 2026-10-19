import {
  useEffect,
  useEffectEvent,
  useRef,
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
  "value" | "defaultValue" | "onChange"
> & {
  value: string;
  /** Called with the value the user settled on: on Enter, on leaving the field, on picking a suggestion. */
  onCommit: (value: string) => void;
};

/**
 * An input reporting only committed values (the DOM's change event, which React's onChange is not), for fields
 * whose every change is expensive. It follows `value` when that changes from outside.
 */
export function CommitInput({ value, onCommit, ...props }: CommitInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [outside, setOutside] = useState(value);
  if (value !== outside) {
    setOutside(value);
    setDraft(value);
  }

  const commit = useEffectEvent(() => onCommit(ref.current!.value));
  useEffect(() => {
    const input = ref.current!;
    const onChange = () => commit();
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, []);

  return (
    <Input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      {...props}
    />
  );
}
