import { Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// Banner (DESIGN.md 11): full-width strip with an icon and text; dismissible when not critical.
// Used for the in-app-browser notice. It never blocks the page.

/**
 * @param {{ tone?: 'info' | 'warning', children: import('react').ReactNode, onDismiss?: () => void, dismissLabel?: string, className?: string }} props
 */
export function Banner({ tone = 'info', children, onDismiss, dismissLabel = 'Dismiss', className }) {
  const Icon = tone === 'warning' ? TriangleAlert : Info;
  return (
    <div
      role="region"
      aria-label="Notice"
      data-slot="banner"
      className={cn(
        'flex w-full items-start gap-3 border-b border-hairline px-4 py-2 text-body-sm text-ink',
        tone === 'warning' ? 'status-tint-warning' : 'status-tint-link',
        className,
      )}
    >
      <Icon className={cn('mt-3 size-5 shrink-0', tone === 'warning' ? 'text-warning' : 'text-link')} aria-hidden="true" />
      <div className="min-w-0 flex-1 py-2.5">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-fill focus-visible:focus-ring"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
