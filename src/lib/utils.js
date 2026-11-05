import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** DDTC type scale names (src/styles/index.css @theme), so tailwind-merge treats them as font sizes. */
export const TYPE_SCALE = Object.freeze([
  'large-title',
  'title-1',
  'title-2',
  'title-3',
  'headline',
  'body',
  'body-sm',
  'label',
  'brand-line',
  'caption',
  'reading',
]);

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...TYPE_SCALE],
      radius: ['xs', 'sm', 'md', 'lg', 'full'],
      shadow: ['overlay'],
    },
  },
});

/**
 * Joins class names and resolves Tailwind conflicts (shadcn/ui convention).
 * @param {...import('clsx').ClassValue} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
