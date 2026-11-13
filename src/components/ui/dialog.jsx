import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

// DESIGN.md 11 and RESPONSIVE.md 15.2: full-screen sheet on phones, centred dialog from 640 px.
// Focus is trapped and Escape closes (Radix Dialog). Destructive confirmations use this dialog.

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** @param {import('react').ComponentProps<typeof DialogPrimitive.Overlay>} props */
export function DialogOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in', className)}
      {...props}
    />
  );
}

/**
 * @param {import('react').ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean, closeLabel?: string }} props
 */
export function DialogContent({ className, children, showClose = true, closeLabel = 'Close', ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto bg-card p-4 pt-sheet pb-sheet text-ink outline-none',
          'data-[state=open]:animate-fade-in',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:max-h-dvh-screen sm:rounded-lg sm:border sm:border-hairline sm:p-6 sm:shadow-overlay sm:data-[state=open]:animate-dialog-in',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full text-ink-secondary hover:bg-fill focus-visible:focus-ring sm:top-3 sm:right-3"
            aria-label={closeLabel}
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** @param {import('react').ComponentProps<'div'>} props */
export function DialogHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 pr-12', className)} {...props} />;
}

/** @param {import('react').ComponentProps<'div'>} props */
export function DialogFooter({ className, ...props }) {
  return <div className={cn('mt-auto flex flex-col-reverse gap-2 sm:mt-0 sm:flex-row sm:justify-end', className)} {...props} />;
}

/** @param {import('react').ComponentProps<typeof DialogPrimitive.Title>} props */
export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn('text-title-3 text-ink', className)} {...props} />;
}

/** @param {import('react').ComponentProps<typeof DialogPrimitive.Description>} props */
export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn('text-body-sm text-ink-secondary', className)} {...props} />;
}
