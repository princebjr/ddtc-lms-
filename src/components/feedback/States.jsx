import { CircleX, Inbox, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';

// Empty, error and offline states (DESIGN.md 11, UI_FEEDBACK.md). Loading, empty and error states
// must look clearly different from each other: empty uses a fill frame and a neutral icon; error
// uses an error icon and a Retry button.

/**
 * @param {{ icon?: import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>, title: string,
 *   description?: string, action?: import('react').ReactNode, className?: string }} props
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div data-slot="empty-state" className={cn('flex flex-col items-center gap-3 rounded-lg bg-fill px-6 py-10 text-center', className)}>
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-card text-ink-secondary">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="m-0 text-headline text-ink">{title}</h2>
      {description ? <p className="m-0 max-w-reading text-body-sm text-ink-secondary">{description}</p> : null}
      {action}
    </div>
  );
}

/**
 * @param {{ title?: string, description?: string, onRetry?: () => void, className?: string }} props
 */
export function ErrorState({ title = 'Something went wrong', description = 'This could not be loaded. Check your connection and try again.', onRetry, className }) {
  return (
    <div role="alert" data-slot="error-state" className={cn('flex flex-col items-center gap-3 rounded-lg border border-hairline bg-card px-6 py-10 text-center', className)}>
      <CircleX className="size-8 text-error" aria-hidden="true" />
      <h2 className="m-0 text-headline text-ink">{title}</h2>
      <p className="m-0 max-w-reading text-body-sm text-ink-secondary">{description}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** @param {{ onRetry?: () => void }} props */
export function OfflineState({ onRetry }) {
  return (
    <div data-slot="offline-state" className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-card px-6 py-10 text-center">
      <WifiOff className="size-8 text-warning" aria-hidden="true" />
      <h2 className="m-0 text-headline text-ink">You are offline</h2>
      <p className="m-0 max-w-reading text-body-sm text-ink-secondary">This page needs a connection. Your work has not been lost. Try again when you are back online.</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
