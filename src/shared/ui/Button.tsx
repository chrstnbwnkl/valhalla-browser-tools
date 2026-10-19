import type { ComponentProps } from 'react';
import { cn } from '../cn';

const VARIANTS = {
  default: 'bg-surface-raised border-line-strong text-ink hover:bg-surface-sunken hover:border-ink',
  primary: 'bg-green border-green text-on-green hover:brightness-108 hover:saturate-110',
  ink: 'bg-ink border-ink text-surface hover:brightness-85',
  ghost: 'bg-transparent border-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-surface-raised border-line-strong text-danger hover:border-danger',
};

const SIZES = {
  md: 'h-9 px-3 text-[14px]/5',
  sm: 'h-7 px-2 text-[13px]/5',
};

export type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
};

export function Button({ variant = 'default', size = 'md', type = 'button', className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-md border font-sans font-bold whitespace-nowrap',
        'transition-[background-color,border-color,filter,transform] duration-100 active:translate-y-px',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:filter-none disabled:active:translate-y-0',
        '[&_svg]:size-4 [&_svg]:flex-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
