import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// A learner's branch (D42) in lists, headers and detail screens: the MapPin icon with the name (never
// the icon alone), or "No branch" in muted text. Screen readers hear "Branch:" first, so the name
// makes sense out of context.

/** @param {{ name: string | null | undefined, className?: string }} props */
export function BranchChip({ name, className }) {
  if (!name) {
    return (
      <span data-slot="branch-chip" data-empty="" className={cn('text-body-sm text-ink-secondary', className)}>
        <span className="sr-only">Branch: </span>
        No branch
      </span>
    );
  }
  return (
    <span data-slot="branch-chip" className={cn('inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-fill px-3 text-label text-ink', className)}>
      <MapPin className="size-4 shrink-0 text-ink-secondary" aria-hidden="true" />
      <span className="sr-only">Branch: </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
