import type { ComponentProps } from 'react';
import { cn } from '../cn';

export function Card({ float, className, ...props }: ComponentProps<'section'> & { float?: boolean }) {
  return (
    <section
      className={cn(
        'rounded-lg border border-line bg-surface-raised p-6',
        float && 'border-transparent shadow-float',
        className,
      )}
      {...props}
    />
  );
}
