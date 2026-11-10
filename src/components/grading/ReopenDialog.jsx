import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { reopenGrade } from '@/lib/grading/grading.js';

// Reopen grade (Phase 9; owner decision 3, ADR-013): a reason is required and kept in the grade
// history. The lecturer may then change the grade; the learner may send the answer again only before
// their effective due date, and keeps seeing any released grade until a new one is released.

/**
 * @param {{ assignmentId: string, learnerId: string, learnerName: string, onClose: () => void, onReopened: () => void }} props
 */
export function ReopenDialog({ assignmentId, learnerId, learnerName, onClose, onReopened }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const submit = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (!reason.trim()) return setError('Give a reason for reopening');
    setError(null);
    setBusy(true);
    try {
      await reopenGrade({ assignmentId, learnerId, reason: reason.trim() });
      toast.show('lecturer.submission-reopened');
      onReopened();
      onClose();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen grade for {learnerName}</DialogTitle>
          <DialogDescription>
            You can then change the grade. Before the due date, {learnerName} can also send the answer again. A released grade stays visible to them until you release a
            new one.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reopen-reason">Reason</Label>
            <Textarea
              id="reopen-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={3}
              className="min-h-24"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'reopen-reason-error' : 'reopen-reason-hint'}
            />
            {error ? (
              <p id="reopen-reason-error" className="m-0 text-body-sm text-error">
                {error}
              </p>
            ) : (
              <p id="reopen-reason-hint" className="m-0 text-caption text-ink-secondary">
                Kept in the grade history.
              </p>
            )}
          </div>
          <FormMessage>{message}</FormMessage>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} loadingLabel="Reopening" disabled={busy}>
              Reopen grade
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
