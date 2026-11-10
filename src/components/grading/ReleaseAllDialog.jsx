import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { releaseGrades } from '@/lib/grading/grading.js';

// Release every draft grade of an assignment (Phase 9; D12, D16): a confirmation, because learners
// see the grades and feedback at once and are notified. The server refuses while the course's
// category weights do not total 100 and says so here.

/** @param {{ assignmentId: string, drafts: number, onClose: () => void, onReleased: () => void }} props */
export function ReleaseAllDialog({ assignmentId, drafts, onClose, onReleased }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  const release = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const { released } = await releaseGrades({ assignmentId });
      toast.show('lecturer.grades-released', { params: { n: String(released) } });
      onReleased();
      onClose();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Release {drafts} {drafts === 1 ? 'grade' : 'grades'}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {drafts === 1 ? 'The learner sees their' : 'Each learner sees their'} grade and feedback straight away and is told a new grade is available. Ungraded
            answers are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormMessage>{message}</FormMessage>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button onClick={() => void release()} loading={busy} loadingLabel="Releasing">
            Release grades
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
