import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

// A confirmation that needs an answer (DESIGN.md 11: destructive actions are always confirmed).
// Radix AlertDialog: focus moves to Cancel and is trapped, Escape cancels, a tap outside does not
// close it. On phones it rises from the bottom edge like a sheet (thumb reach, safe area); from
// 640 px it is a centred card. Buttons are 44 px; Cancel comes first for keyboard and screen readers.

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

/** @param {import('react').ComponentProps<typeof AlertDialogPrimitive.Content>} props */
export function AlertDialogContent({ className, children, ...props }) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay data-slot="alert-dialog-overlay" className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in" />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-lg border-t border-hairline bg-card p-4 pb-safe text-ink shadow-overlay outline-none',
          'data-[state=open]:animate-fade-in',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:p-6 sm:data-[state=open]:animate-dialog-in',
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

/** @param {import('react').ComponentProps<'div'>} props */
export function AlertDialogHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />;
}

/** @param {import('react').ComponentProps<'div'>} props */
export function AlertDialogFooter({ className, ...props }) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

/** @param {import('react').ComponentProps<typeof AlertDialogPrimitive.Title>} props */
export function AlertDialogTitle({ className, ...props }) {
  return <AlertDialogPrimitive.Title className={cn('text-title-3 text-ink', className)} {...props} />;
}

/** @param {import('react').ComponentProps<typeof AlertDialogPrimitive.Description>} props */
export function AlertDialogDescription({ className, ...props }) {
  return <AlertDialogPrimitive.Description className={cn('text-body-sm text-ink-secondary', className)} {...props} />;
}
