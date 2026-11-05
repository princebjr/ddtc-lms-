import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// Inset grouped list (DESIGN.md 8 and 11): rounded group, hairline dividers, 56 px rows with a
// leading icon or avatar, title, secondary line and a trailing chevron or value.

/** @param {import('react').ComponentProps<'ul'>} props */
export function InsetList({ className, ...props }) {
  return (
    <ul
      data-slot="inset-list"
      className={cn('m-0 list-none divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-card p-0', className)}
      {...props}
    />
  );
}

/**
 * @param {{ leading?: import('react').ReactNode, title: import('react').ReactNode, secondary?: import('react').ReactNode,
 *   trailing?: import('react').ReactNode, chevron?: boolean, className?: string }} props
 */
export function InsetListRow({ leading, title, secondary, trailing, chevron = false, className }) {
  return (
    <li className={cn('flex min-h-14 items-center gap-3 px-4 py-2', className)}>
      {leading ? <span className="flex shrink-0 items-center text-ink-secondary">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body text-ink">{title}</span>
        {secondary ? <span className="truncate text-body-sm text-ink-secondary">{secondary}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-body-sm text-ink-secondary">{trailing}</span> : null}
      {chevron ? <ChevronRight className="size-5 shrink-0 text-ink-tertiary" aria-hidden="true" /> : null}
    </li>
  );
}
