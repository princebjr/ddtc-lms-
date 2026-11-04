import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

// Bottom sheet (DESIGN.md 11 and 12.4): slides up from the bottom with a grab handle, 24 px top
// radius, scrim, focus trapped, Escape or a tap on the scrim closes. Respects the bottom safe area.

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

/**
 * @param {import('react').ComponentProps<typeof SheetPrimitive.Content> & { title: string, description?: string, hideTitle?: boolean, closeLabel?: string }} props
 */
export function SheetContent({ className, children, title, description, hideTitle = false, closeLabel = 'Close', ...props }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim data-[state=open]:animate-fade-in" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-dvh-screen w-full max-w-lg flex-col rounded-t-lg border-t border-hairline bg-card text-ink shadow-overlay outline-none',
          'pb-safe data-[state=open]:animate-sheet-in',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex justify-center pt-2" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-hairline" />
        </div>
        <div className="flex items-center gap-2 px-4 pt-1 pb-2">
          <SheetPrimitive.Title className={cn('flex-1 text-headline text-ink', hideTitle && 'sr-only')}>{title}</SheetPrimitive.Title>
          <SheetPrimitive.Close
            className="inline-flex size-11 items-center justify-center rounded-full text-ink-secondary hover:bg-fill focus-visible:focus-ring"
            aria-label={closeLabel}
          >
            <X className="size-5" aria-hidden="true" />
          </SheetPrimitive.Close>
        </div>
        {description ? <SheetPrimitive.Description className="sr-only">{description}</SheetPrimitive.Description> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">{children}</div>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
