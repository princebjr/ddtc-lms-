import { cn } from '@/lib/utils.js';

// Skeleton block (DESIGN.md 12.3): skeleton-base with a 1.4 s shimmer, static under reduced motion.
// Radius matches the real element: 'line' and 'field' 12 px, 'card' 24 px, 'circle' for avatars.
const SHAPES = Object.freeze({
  line: 'h-4 rounded-sm',
  field: 'h-12 rounded-sm',
  button: 'h-11 rounded-full',
  card: 'rounded-lg',
  circle: 'rounded-full',
  chip: 'h-7 w-20 rounded-full',
});

/** @param {import('react').ComponentProps<'div'> & { shape?: keyof typeof SHAPES }} props */
export function Skeleton({ className, shape = 'line', ...props }) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn('skeleton-shimmer', SHAPES[shape], className)} {...props} />;
}
