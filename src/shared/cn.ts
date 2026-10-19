import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// so tailwind-merge can tell e.g. shadow-float from a shadow colour
const merge = extendTailwindMerge({
  extend: {
    theme: {
      font: ["display", "sans", "mono"],
      radius: ["sm", "md", "lg", "full"],
      shadow: ["sm", "float"],
    },
  },
});

export const cn = (...classes: ClassValue[]) => merge(clsx(classes));
