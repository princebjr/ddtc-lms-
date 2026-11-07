import { ArrowDown, ArrowUp, Download, FilePlus2, FileText, Mic, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { ConfirmDeleteDialog } from '@/components/feedback/ConfirmDeleteDialog.jsx';
import { LessonPageSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { useMediaDelete } from '@/hooks/use-media-delete.js';
import { fileSize } from '@/lib/audio/format.js';
import { computePeaks } from '@/lib/audio/peaks.js';
import { downloadMedia, fetchAudioHistory, fetchLessonMedia, MAX_LESSON_AUDIO, playbackUrl, renameAudio, reorderAudio } from '@/lib/lessons/lessons.js';
import { uploadFile } from '@/lib/uploads.js';

// The lesson editor's media cards (Phase 6; D09, D17, D18, ADR-006, ADR-007), for the course's
// lecturers and administrators:
//   AudioCard        up to 10 audio files, each with its title, player, Rename, Replace (the old file
//                    is kept as history), Move up and down, and Delete; Add audio with upload progress
//                    and the waveform computed in this browser while it uploads; the history of
//                    replaced and deleted files, with Delete on replaced ones.
//   AttachmentsCard  PDF, Word and PowerPoint files: add, download, delete.
// Every delete is confirmed and goes through delete-media (useMediaDelete); the list changes only
// once the server has confirmed. An archived course is read-only: no actions are offered.

const AUDIO_ACCEPT = '.mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav';
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav'];
const AUDIO_MAX = 100 * 1024 * 1024; // D17; the server checks again
const DOC_ACCEPT = '.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOC_EXTENSIONS = ['pdf', 'docx', 'pptx'];
const DOC_MAX = 25 * 1024 * 1024;

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });
/** @param {string} name */
const extension = (name) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

/** @typedef {import('@/lib/lessons/lessons.js').LessonMedia} LessonMedia */

/**
 * @param {{ lessonId: string, courseId: string, lessonTitle: string, archived: boolean }} props
 */
export function AudioCard({ lessonId, courseId, lessonTitle, archived }) {
  const toast = useToast();
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const replacing = useRef(/** @type {LessonMedia | null} */ (null));
  const media = useLoad(async () => {
    const [m, history] = await Promise.all([fetchLessonMedia(lessonId), fetchAudioHistory(lessonId)]);
    return { audios: m.audios, history };
  }, [lessonId]);
  const [progress, setProgress] = useState(/** @type {null | { name: string, stage: string, fraction: number }} */ (null));
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const [moving, setMoving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [renaming, setRenaming] = useState(/** @type {LessonMedia | null} */ (null));
  const deleter = useMediaDelete({ kind: 'lesson-audio', onDeleted: () => media.reload() });
  const audios = media.data?.audios ?? [];
  const history = media.data?.history ?? [];
  const full = audios.length >= MAX_LESSON_AUDIO;

  /** @param {LessonMedia | null} target the audio to replace, or null to add one */
  const choose = (target) => {
    replacing.current = target;
    input.current?.click();
  };

  /** @param {File} file */
  const upload = async (file) => {
    const target = replacing.current;
    setProblem(null);
    if (!AUDIO_EXTENSIONS.includes(extension(file.name))) return setProblem('Use an MP3, M4A or WAV file.');
    if (file.size > AUDIO_MAX) return setProblem('The file is larger than 100 MB.');
    setProgress({ name: file.name, stage: 'Uploading', fraction: 0 });
    try {
      // The waveform is prepared here while the file uploads (ADR-006); the server checks its shape.
      const peaks = computePeaks(file).then((p) => (p ? { peaks: p } : {}));
      const res = /** @type {{ replaced: boolean }} */ (
        await uploadFile({
          resourceType: 'LESSON_AUDIO',
          file,
          courseId,
          lessonId,
          replaceAudioId: target?.item_id,
          finalizeLater: peaks,
          onProgress: (fraction) => setProgress({ name: file.name, stage: fraction < 1 ? 'Uploading' : 'Checking the file', fraction }),
        })
      );
      toast.show(res.replaced ? 'lecturer.audio-replaced' : 'lecturer.audio-ready');
      media.reload();
    } catch (error) {
      const reason = /** @type {Error} */ (error).message.replace(/\.$/, '');
      toast.show('lecturer.audio-rejected', { params: { reason }, onAction: () => choose(target) });
    } finally {
      setProgress(null);
      replacing.current = null;
      if (input.current) input.current.value = '';
    }
  };

  /** @param {number} index @param {-1 | 1} step */
  const move = async (index, step) => {
    const before = audios.map((a) => a.item_id);
    const after = [...before];
    [after[index], after[index + step]] = [after[index + step], after[index]];
    setMoving(true);
    setProblem(null);
    try {
      await reorderAudio(lessonId, after);
      media.reload();
      toast.show('lecturer.order-saved', {
        onAction: async () => {
          await reorderAudio(lessonId, before);
          media.reload();
        },
      });
    } catch (error) {
      setProblem(/** @type {Error} */ (error).message);
    } finally {
      setMoving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Lesson audio</CardTitle>
        {audios.length ? (
          <span className="text-caption text-ink-secondary tabular-nums">
            {audios.length} of {MAX_LESSON_AUDIO}
          </span>
        ) : null}
      </div>
      <LoadingRegion loading={media.state === 'loading'} skeleton={<LessonPageSkeleton />} onRetry={media.reload}>
        {audios.length ? (
          <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Audio files, in the order learners see them">
            {audios.map((a, i) => (
              <li key={a.item_id} className="flex flex-col gap-2" data-slot="lesson-audio-item">
                {/* Standard size: the side card is too narrow for the one-row compact layout. */}
                <AudioPlayer
                  title={a.title}
                  subtitle={lessonTitle}
                  getUrl={() => playbackUrl(a)}
                  durationSeconds={a.duration_seconds}
                  peaks={a.waveform_peaks}
                  fileSize={a.file_size}
                  onDownload={() => downloadMedia(a)}
                />
                {archived ? null : (
                  <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Actions for ${a.title}`}>
                    <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0 || moving} aria-label={`Move ${a.title} up`}>
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === audios.length - 1 || moving} aria-label={`Move ${a.title} down`}>
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" className="px-3" onClick={() => setRenaming(a)} aria-label={`Rename ${a.title}`}>
                      <Pencil aria-hidden="true" />
                      Rename
                    </Button>
                    <Button variant="ghost" className="px-3" onClick={() => choose(a)} disabled={progress !== null} aria-label={`Replace ${a.title}`}>
                      <RefreshCw aria-hidden="true" />
                      Replace
                    </Button>
                    <Button variant="ghost" size="icon" className="ml-auto text-error" onClick={() => deleter.ask({ id: a.item_id, name: a.title })} aria-label={`Delete ${a.title}`}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <CardDescription>No audio yet. Add up to {MAX_LESSON_AUDIO} audio files: MP3, M4A or WAV, each up to 100 MB and 90 minutes.</CardDescription>
        )}
      </LoadingRegion>
      {progress ? (
        <div className="flex flex-col gap-2" role="status">
          <span className="truncate text-body-sm text-ink-secondary">
            {progress.stage} {progress.name}
            {progress.stage === 'Uploading' ? ` ${Math.round(progress.fraction * 100)}%` : '…'}
          </span>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.fraction * 100)}
            className="h-2 overflow-hidden rounded-full bg-fill"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-base" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {archived ? null : (
        <>
          <input
            ref={input}
            type="file"
            accept={AUDIO_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <Button variant="outline" onClick={() => choose(null)} disabled={progress !== null || full || media.state !== 'ready'}>
            <Mic aria-hidden="true" />
            Add audio
          </Button>
          {full ? <CardDescription>A lesson can have up to {MAX_LESSON_AUDIO} audio files. Delete one to add another.</CardDescription> : null}
        </>
      )}
      <FormMessage>{problem}</FormMessage>
      {history.length ? (
        <div className="flex flex-col gap-1 text-body-sm text-ink-secondary">
          <Button variant="ghost" className="self-start px-2" aria-expanded={showHistory} aria-controls={`audio-history-${lessonId}`} onClick={() => setShowHistory((v) => !v)}>
            Audio history ({history.length})
          </Button>
          <ul id={`audio-history-${lessonId}`} hidden={!showHistory} className="m-0 flex list-none flex-col p-0">
            {history.map((h) => (
              <li key={h.id} className="flex min-h-11 items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{h.title}</span>
                  {' · '}
                  {h.lifecycle_status === 'DELETED'
                    ? `deleted ${h.deleted_at ? dateFormat.format(new Date(h.deleted_at)) : ''}`
                    : `replaced ${h.superseded_at ? dateFormat.format(new Date(h.superseded_at)) : ''}`}
                  {' · uploaded '}
                  {dateFormat.format(new Date(h.created_at))}
                </span>
                {archived || h.lifecycle_status === 'DELETED' ? null : (
                  <Button variant="ghost" size="icon" className="text-error" onClick={() => deleter.ask({ id: h.id, name: h.title })} aria-label={`Delete the replaced version of ${h.title}`}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDeleteDialog state={deleter} title="Delete this audio?" />
      <RenameAudioDialog
        audio={renaming}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null);
          media.reload();
        }}
      />
    </Card>
  );
}

/** @param {{ audio: LessonMedia | null, onClose: () => void, onSaved: () => void }} props */
function RenameAudioDialog({ audio, onClose, onSaved }) {
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [saving, setSaving] = useState(false);

  /** @param {import('react').FormEvent<HTMLFormElement>} e */
  const submit = async (e) => {
    e.preventDefault();
    if (!audio) return;
    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
    if (!title) return setError('Enter a title');
    if (title.length > 200) return setError('Use 200 characters or fewer');
    setSaving(true);
    setError(null);
    try {
      await renameAudio(audio.item_id, title);
      onSaved();
    } catch (err) {
      setError(/** @type {Error} */ (err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={audio !== null} onOpenChange={(open) => !open && !saving && (setError(null), onClose())}>
      {audio ? (
        <DialogContent>
          <form noValidate onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Rename audio</DialogTitle>
              <DialogDescription>Learners see this title above the player.</DialogDescription>
            </DialogHeader>
            <FormField label="Audio title" name="title" defaultValue={audio.title} error={error ?? undefined} autoComplete="off" />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} loadingLabel="Saving">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/**
 * Attachments (PDF, DOCX, PPTX): add, download, delete (ADR-007: the file is deleted, the record kept).
 * @param {{ lessonId: string, courseId: string, archived: boolean }} props
 */
export function AttachmentsCard({ lessonId, courseId, archived }) {
  const toast = useToast();
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const media = useLoad(() => fetchLessonMedia(lessonId), [lessonId]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const deleter = useMediaDelete({ kind: 'lesson-attachment', onDeleted: () => media.reload() });
  const attachments = media.data?.attachments ?? [];

  /** @param {File} file */
  const upload = async (file) => {
    setProblem(null);
    if (!DOC_EXTENSIONS.includes(extension(file.name))) return setProblem('Use a PDF, Word (.docx) or PowerPoint (.pptx) file.');
    if (file.size > DOC_MAX) return setProblem('The file is larger than 25 MB.');
    setBusy(true);
    try {
      await uploadFile({ resourceType: 'LESSON_ATTACHMENT', file, courseId, lessonId, finalize: { title: file.name.replace(/\.[^.]+$/, '') } });
      toast.show('lecturer.attachment-added');
      media.reload();
    } catch (error) {
      setProblem(/** @type {Error} */ (error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Attachments</CardTitle>
      {attachments.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
          {attachments.map((a) => (
            <li key={a.item_id} className="flex min-h-14 items-center gap-2 py-1">
              <FileText className="size-5 shrink-0 text-ink-secondary" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-label text-ink">{a.title}</span>
                <span className="text-caption text-ink-secondary">{fileSize(a.file_size)}</span>
              </span>
              <Button variant="ghost" size="icon" onClick={() => downloadMedia(a)} aria-label={`Download ${a.title}`}>
                <Download aria-hidden="true" />
              </Button>
              {archived ? null : (
                <Button variant="ghost" size="icon" className="text-error" onClick={() => deleter.ask({ id: a.item_id, name: a.title })} aria-label={`Delete ${a.title}`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <CardDescription>No attachments. PDF, Word or PowerPoint, up to 25 MB.</CardDescription>
      )}
      {archived ? null : (
        <>
          <input
            ref={input}
            type="file"
            accept={DOC_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <Button variant="outline" onClick={() => input.current?.click()} loading={busy} loadingLabel="Uploading">
            <FilePlus2 aria-hidden="true" />
            Add attachment
          </Button>
        </>
      )}
      <FormMessage>{problem}</FormMessage>
      <ConfirmDeleteDialog state={deleter} title="Delete this attachment?" />
    </Card>
  );
}
