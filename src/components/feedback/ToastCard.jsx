import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';

/** @typedef {import('@/lib/toast/controller.js').ToastState} ToastState */

const ICONS = { success: CircleCheck, info: Info, warning: TriangleAlert, error: CircleX };
const ICON_COLOUR = { success: 'text-success', info: 'text-link', warning: 'text-warning', error: 'text-error' };
const TYPE_LABEL = { success: 'Success', info: 'Information', warning: 'Warning', error: 'Error' };

/**
 * One toast (DESIGN.md 12.1): card fill, hairline, 16 px radius, overlay shadow, status icon,
 * optional text button in the link colour and a close button. Escape dismisses it; focus or
 * hover pauses its timer. Errors are announced assertively, others politely.
 *
 * @param {{ state: ToastState, onDismiss: () => void, onAction: () => void, onPause: () => void, onResume: () => void }} props
 */
export function ToastCard({ state, onDismiss, onAction, onPause, onResume }) {
  const Icon = ICONS[state.type];
  return (
    <div
      role={state.type === 'error' ? 'alert' : 'status'}
      aria-live={state.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      data-toast-type={state.type}
      data-toast-id={state.id}
      tabIndex={-1}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={(event) => {
        if (!event.currentTarget.contains(/** @type {Node | null} */ (event.relatedTarget))) onResume();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onDismiss();
        }
      }}
      className={cn(
        'pointer-events-auto flex w-full items-center gap-3 rounded-md border border-hairline bg-card py-1 pr-1 pl-4 text-body-sm text-ink shadow-overlay',
        'focus-visible:focus-ring',
      )}
    >
      <Icon className={cn('size-5 shrink-0', ICON_COLOUR[state.type])} aria-hidden="true" />
      <p className="min-w-0 flex-1 py-2">
        <span className="sr-only">{TYPE_LABEL[state.type]}: </span>
        {state.text}
        {state.count > 1 ? <span className="text-ink-secondary"> ({state.count})</span> : null}
      </p>
      {state.actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-11 shrink-0 items-center rounded-full px-3 text-label text-link hover:bg-fill focus-visible:focus-ring"
        >
          {state.actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-fill focus-visible:focus-ring"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
