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
    // The safe-area paddings (src/styles/index.css) are paddings too, so a later p-4 or pb-4 replaces them.
    // Without this, a centred dialog that asked for pb-4 kept the bottom sheet's pb-safe (0 on most phones)
    // and its last button touched the card's edge (owner, 2026-11-13).
    classGroups: {
      pt: ['pt-safe', 'pt-sheet'],
      pb: ['pb-safe', 'pb-sheet'],
      pl: ['pl-safe'],
      pr: ['pr-safe'],
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
