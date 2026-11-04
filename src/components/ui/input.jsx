import { cn } from '@/lib/utils.js';

// DESIGN.md 11: card fill, 1 px control border, 12 px radius, 48 px high, 16 px text,
// 2 px focus ring with 2 px offset, 2 px error border when invalid.
export const fieldChrome = [
  'w-full min-w-0 rounded-sm border border-control bg-card px-4 text-body text-ink',
  'placeholder:text-ink-tertiary',
  'focus-visible:focus-ring',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-invalid:border-2 aria-invalid:border-error',
].join(' ');

/** @param {import('react').ComponentProps<'input'>} props */
export function Input({ className, type = 'text', ...props }) {
  return <input type={type} data-slot="input" className={cn(fieldChrome, 'h-12', className)} {...props} />;
}
