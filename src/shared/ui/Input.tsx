import type { ComponentProps } from 'react';
import { cn } from '../cn';

const FIELD =
  'w-full rounded-md border border-line-strong bg-surface-raised px-3 text-[15px]/5 font-medium text-ink ' +
  'placeholder:text-ink-subtle hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-focus aria-invalid:border-danger';

const MONO = 'font-mono text-[14px]/5 font-normal';

export function Input({ mono, className, ...props }: ComponentProps<'input'> & { mono?: boolean }) {
  return <input className={cn(FIELD, 'h-9', mono && MONO, className)} {...props} />;
}

export function TextArea({ mono, className, ...props }: ComponentProps<'textarea'> & { mono?: boolean }) {
  return <textarea className={cn(FIELD, 'py-3', mono && MONO, className)} {...props} />;
}
