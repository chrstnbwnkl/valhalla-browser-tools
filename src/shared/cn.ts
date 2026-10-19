import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge has to know the theme's own names to tell e.g. shadow-float from a shadow color
const merge = extendTailwindMerge({
  extend: {
    theme: {
      font: ['display', 'sans', 'mono'],
      radius: ['sm', 'md', 'lg', 'full'],
      shadow: ['sm', 'float'],
    },
  },
});

/** Joins class names; later Tailwind classes win over conflicting earlier ones, so callers can override. */
export const cn = (...classes: ClassValue[]) => merge(clsx(classes));
