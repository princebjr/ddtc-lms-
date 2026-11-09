import { CircleCheck, CircleX, Info, TriangleAlert, Circle } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// Chip and status badge (DESIGN.md 11): pill, label type, status tint (12 % over card), always an
// icon plus text, never colour alone.

const TONES = Object.freeze({
  success: { icon: CircleCheck, className: 'status-tint-success text-success' },
  warning: { icon: TriangleAlert, className: 'status-tint-warning text-warning' },
  error: { icon: CircleX, className: 'status-tint-error text-error' },
  info: { icon: Info, className: 'status-tint-link text-link' },
  neutral: { icon: Circle, className: 'bg-fill text-ink-secondary' },
});

/** @param {{ tone?: keyof typeof TONES, children: import('react').ReactNode, className?: string }} props */
export function StatusChip({ tone = 'neutral', children, className }) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <span data-slot="status-chip" data-tone={tone} className={cn('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-label', toneClass, className)}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="text-ink">{children}</span>
    </span>
  );
}
