import { useState } from 'react';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { deleteMedia } from '@/lib/media.js';

// One delete flow for lesson audio, attachments and course covers (ADR-007), used with
// <ConfirmDeleteDialog>: ask(item) opens the confirmation; Delete shows a loading state and calls
// the server; only once the server confirms does the dialog close, the success toast show and
// onDeleted(item) run (the caller then takes the item away). On failure the dialog closes, an error
// toast offers Try again, and the item stays where it was. Cancel does nothing while a delete is
// in flight.

/** @typedef {import('@/lib/media.js').MediaKind} MediaKind */
/** @typedef {{ id: string, name: string }} DeleteTarget */

/** @type {Record<MediaKind, import('@/lib/toast/catalogue.js').ToastId>} */
const DONE = {
  'lesson-audio': 'lecturer.audio-deleted',
  'lesson-attachment': 'lecturer.attachment-deleted',
  'course-cover': 'lecturer.cover-removed',
};

/**
 * @param {{ kind: MediaKind, onDeleted: (item: DeleteTarget) => void }} options
 */
export function useMediaDelete({ kind, onDeleted }) {
  const toast = useToast();
  const [target, setTarget] = useState(/** @type {DeleteTarget | null} */ (null));
  const [busy, setBusy] = useState(false);

  /** @param {DeleteTarget} item */
  const run = async (item) => {
    setBusy(true);
    try {
      await deleteMedia(kind, item.id);
      setTarget(null);
      toast.show(DONE[kind]);
      onDeleted(item);
    } catch (error) {
      setTarget(null);
      const reason = (/** @type {Error} */ (error).message || 'Try again').replace(/\.$/, '');
      toast.show('lecturer.delete-failed', { params: { reason }, onAction: () => void run(item) });
    } finally {
      setBusy(false);
    }
  };

  return {
    kind,
    target,
    busy,
    /** @param {DeleteTarget} item */
    ask: (item) => setTarget(item),
    cancel: () => {
      if (!busy) setTarget(null);
    },
    confirm: () => {
      if (target && !busy) void run(target);
    },
  };
}
