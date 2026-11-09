import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { formatDue, fromGhanaInput, toGhanaInput } from '@/lib/assignments/due.js';
import { removeExtension, setExtension } from '@/lib/submissions/submissions.js';

// One learner's extension (D13, owner decision 6, 2026-11-08): the course's lecturers and
// administrators set or change it (a date after the assignment's due date and in the future, Ghana
// time), with "Extension granted" and Undo, or take it back ("Extension removed"; the record is
// kept). The server checks everything again.

/**
 * @param {{
 *   assignmentId: string,
 *   learner: { id: string, name: string },
 *   dueAt: string,
 *   extendedTo: string | null,
 *   onClose: () => void,
 *   onChanged: () => void,
 * }} props
 */
export function ExtensionDialog({ assignmentId, learner, dueAt, extendedTo, onClose, onChanged }) {
  const toast = useToast();
  const [value, setValue] = useState(() => toGhanaInput(extendedTo ?? new Date(Math.max(Date.parse(dueAt), Date.now()) + 7 * 86_400_000).toISOString()));
  const [reason, setReason] = useState('');
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(/** @type {null | 'save' | 'remove'} */ (null));

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const save = async (event) => {
    event.preventDefault();
    setMessage(null);
    const iso = fromGhanaInput(value);
    if (!iso) return setError('Choose the new due date and time');
    if (Date.parse(iso) <= Date.parse(dueAt)) return setError(`Choose a date after the due date (${formatDue(dueAt)})`);
    if (Date.parse(iso) <= Date.now()) return setError('Choose a date in the future');
    setError(null);
    setBusy('save');
    try {
      const { previous } = await setExtension({ assignmentId, learnerId: learner.id, extendedDueAt: iso, reason: reason.trim() || undefined });
      toast.show('lecturer.extension-granted', {
        onAction: () => {
          const undo = previous
            ? setExtension({ assignmentId, learnerId: learner.id, extendedDueAt: previous, undo: true })
            : removeExtension(assignmentId, learner.id);
          undo.then(onChanged, () => toast.show('request.failed'));
        },
      });
      onChanged();
      onClose();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(null);
    }
  };

  const takeBack = async () => {
    setMessage(null);
    setBusy('remove');
    try {
      await removeExtension(assignmentId, learner.id);
      toast.show('lecturer.extension-removed');
      onChanged();
      onClose();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extension for {learner.name}</DialogTitle>
          <DialogDescription>
            The assignment is due {formatDue(dueAt)} (Ghana time).{' '}
            {extendedTo ? `Their extension runs to ${formatDue(extendedTo)}.` : 'They have no extension.'}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={save} className="flex flex-col gap-4">
          <FormField
            label="New due date and time"
            name="extendedDueAt"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={error ?? undefined}
            hint="Ghana time (GMT)."
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="extension-reason">Reason (optional)</Label>
            <Textarea id="extension-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} className="min-h-24" />
          </div>
          <FormMessage>{message}</FormMessage>
          <DialogFooter>
            {extendedTo ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void takeBack()}
                loading={busy === 'remove'}
                loadingLabel="Taking back"
                disabled={busy !== null}
              >
                Take back extension
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy !== null}>
              Cancel
            </Button>
            <Button type="submit" loading={busy === 'save'} loadingLabel="Saving" disabled={busy !== null}>
              Save extension
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
