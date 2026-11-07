import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';

// The confirmation for useMediaDelete (ADR-007): "Delete this audio? This cannot be undone." with
// Cancel and a destructive Delete that shows a spinner until the server answers. While a delete is
// in flight, Cancel, Escape and the outside area do nothing.

/**
 * @param {{
 *   state: ReturnType<typeof import('@/hooks/use-media-delete.js').useMediaDelete>,
 *   title: string,
 *   description?: (name: string) => string,
 *   confirmLabel?: string,
 * }} props
 */
export function ConfirmDeleteDialog({ state, title, description = (name) => `“${name}” will be deleted for everyone. This cannot be undone.`, confirmLabel = 'Delete' }) {
  const { target, busy } = state;
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && state.cancel()}>
      {target ? (
        <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description(target.name)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost" disabled={busy}>
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button variant="destructive" onClick={state.confirm} loading={busy} loadingLabel="Deleting">
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
