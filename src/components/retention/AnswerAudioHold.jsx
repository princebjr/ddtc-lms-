import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchAnswerHold, holdError, placeHold, releaseHold } from '@/lib/admin/retention.js';

// "Hold this answer's audio" for administrators (Phase 12, ADR-022 decision 4), on an assignment answer and
// on an examination script: a held answer's recordings are never removed by retention, whatever its age.
// Hold asks for a reason; Release lets retention apply again. Both toasts offer Undo.

/**
 * @param {{ scope: 'SUBMISSION' | 'EXAM_ATTEMPT', parentId: string, learnerId: string }} props
 */
export function AnswerAudioHold({ scope, parentId, learnerId }) {
  const toast = useToast();
  const page = useLoad(() => fetchAnswerHold(scope, parentId, learnerId), [scope, parentId, learnerId]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const answer = page.data ?? null;
  if (page.state !== 'ready' || !answer) return null;

  /** @param {string} why */
  const place = async (why) => {
    const id = await placeHold(scope, answer.answer_id, why);
    page.reload();
    toast.show('admin.hold-placed', { onAction: () => void releaseHold(id).then(page.reload, () => toast.show('request.failed')) });
  };
  const submit = async () => {
    if (reason.trim().length < 3) return setMessage('Give a reason of 3 to 500 characters');
    setBusy(true);
    setMessage(null);
    try {
      await place(reason.trim());
      setOpen(false);
      setReason('');
    } catch (e) {
      setMessage(holdError(e));
    } finally {
      setBusy(false);
    }
  };
  const release = async () => {
    if (!answer.hold_id) return;
    const why = answer.reason ?? 'Held again';
    setBusy(true);
    try {
      await releaseHold(answer.hold_id);
      page.reload();
      toast.show('admin.hold-released', { onAction: () => void place(why).catch(() => toast.show('request.failed')) });
    } catch (e) {
      setMessage(holdError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-2" data-slot="answer-audio-hold">
      <CardTitle className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-ink-secondary" aria-hidden="true" />
        Audio retention
      </CardTitle>
      {answer.hold_id ? (
        <>
          <CardDescription>{`Held: ${answer.reason}. This answer's recordings are kept whatever their age.`}</CardDescription>
          <Button variant="outline" className="self-start" onClick={() => void release()} loading={busy} loadingLabel="Releasing">
            Release hold
          </Button>
        </>
      ) : (
        <>
          <CardDescription>Not held. Retention may remove this answer's recordings once its grade has been released long enough.</CardDescription>
          <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
            Hold this answer's audio
          </Button>
        </>
      )}
      <FormMessage>{open ? null : message}</FormMessage>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hold this answer's audio</DialogTitle>
            <DialogDescription>Retention will not remove its recordings until the hold is released. The reason is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <Label htmlFor="answer-hold-reason">Reason</Label>
            <Textarea id="answer-hold-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
          </div>
          <FormMessage>{message}</FormMessage>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={busy} loadingLabel="Placing hold">
              Place hold
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
