import { Mic, PenLine, Send, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Recorder } from '@/components/recorder/Recorder.jsx';
import { Banner } from '@/components/ui/banner.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useDraftAutosave, useDraftStart } from '@/hooks/use-draft.js';
import { computePeaks } from '@/lib/audio/peaks.js';
import { extensionForMime, LEARNER_RECORDING } from '@/lib/recording/format.js';
import { limitFor, limitText, recordingLimits, useClientSettings } from '@/lib/settings/client-settings.js';
import { clearRecordingDraft, loadRecordingDraft } from '@/lib/recording/recording-drafts.js';
import { MAX_TEXT_ANSWER, removeDraftFile, submitAnswer } from '@/lib/submissions/submissions.js';
import { uploadFile } from '@/lib/uploads.js';
import { cn } from '@/lib/utils.js';
import { UploadRow } from './UploadRow.jsx';

// The learner's answer (Phase 8; prototype `nsub`; D10, ADR-009, owner decisions 1, 2 and 4; D43).
// One answer can combine a plain-text answer with up to 5 files: recordings, audio uploads, and PDF
// or Word where the lecturer allowed them. Write, Record and Upload add parts; everything added is
// listed before Submit, which sends it all as the next version. Files upload as soon as they are
// added (resumable, so a dropped connection carries on), wait on the server for the next version,
// and can be removed until sent. The text answer and a recording in progress are kept on this
// device as drafts (24 hours, "Draft restored"); recording and uploading count as activity.

const AUDIO_ACCEPT = '.mp3,.m4a,.mp4,.wav,.webm,.weba,.ogg,.oga,.opus,audio/*';
const DOCUMENT_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'mp4', 'wav', 'webm', 'weba', 'ogg', 'oga', 'opus'];

/** @typedef {import('@/lib/submissions/submissions.js').MySubmission} MySubmission */
/** @typedef {import('./UploadRow.jsx').AnswerPart} AnswerPart */

/** The kind of answer file a name stands for, as the server decides it from the extension. @param {string} name */
export function answerRoleFor(name) {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? '';
  if (AUDIO_EXTENSIONS.includes(ext)) return /** @type {const} */ ('AUDIO');
  if (ext === 'pdf') return /** @type {const} */ ('PDF');
  if (ext === 'docx') return /** @type {const} */ ('DOCX');
  return null;
}

/** @param {import('@/lib/submissions/submissions.js').AnswerFile} f @returns {AnswerPart} */
const fromServer = (f) => ({
  key: f.id,
  fileId: f.id,
  name: f.original_filename,
  size: f.file_size ?? 0,
  role: f.file_role === 'PDF' || f.file_role === 'DOCX' ? f.file_role : 'AUDIO',
  status: f.status === 'VALIDATED' ? 'ready' : 'failed',
  progress: f.status === 'VALIDATED' ? 1 : 0,
  error: f.status === 'VALIDATED' ? null : 'This upload did not finish. Remove it and add the file again.',
  durationSeconds: f.duration_seconds,
});

/**
 * @param {{ assignmentId: string, title: string, mine: MySubmission, onSent: () => void }} props
 */
export function AnswerForm({ assignmentId, title, mine, onSent }) {
  const auth = useAuth();
  const userId = auth.profile?.id ?? '';
  const toast = useToast();
  const last = mine.versions[0] ?? null;
  const draftKey = `answer:${assignmentId}`;
  // A new answer starts from the last one's text, so a resubmission can be an edit of it.
  const [saved] = useState(() => ({ text: last?.text_answer ?? '' }));
  const start = useDraftStart(draftKey, saved, { isNew: !last });
  const [text, setText] = useState(start.text);
  const clearTextDraft = useDraftAutosave(draftKey, saved, { text }, { isNew: !last });
  const [mode, setMode] = useState('write');
  const [parts, setParts] = useState(() => mine.draft_files.map(fromServer));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  // While recording or reviewing a recording, the Submit bar stays in place instead of floating over the recorder.
  const [recorderActive, setRecorderActive] = useState(false);
  const [restored, setRestored] = useState(/** @type {import('@/hooks/use-recorder.js').Recording | null} */ (null));
  const controllers = useRef(/** @type {Map<string, AbortController>} */ (new Map()));
  const sources = useRef(/** @type {Map<string, { file: File, peaks: number[] | null }>} */ (new Map()));
  const request = useRef(/** @type {string | null} */ (null));
  const audioInput = useRef(/** @type {HTMLInputElement | null} */ (null));
  const documentInput = useRef(/** @type {HTMLInputElement | null} */ (null));
  const recordingDraft = useMemo(() => (userId ? { userId, key: draftKey } : null), [userId, draftKey]);

  // Limits from Settings (the server checks again, D18).
  const settings = useClientSettings();
  const audioLimit = limitFor(settings, 'submission_audio');
  const docLimit = limitFor(settings, 'submission_document');
  const recorderLimits = useMemo(() => recordingLimits(settings, 'submission_audio', LEARNER_RECORDING), [settings]);
  const documentKinds = mine.accepted_formats.filter((f) => f === 'PDF' || f === 'DOCX').map((f) => (f === 'PDF' ? 'PDF' : 'Word'));
  const active = parts.filter((p) => p.status !== 'rejected' && p.status !== 'failed');
  const full = active.length >= mine.max_files;
  const uploading = parts.some((p) => p.status === 'uploading' || p.status === 'checking');
  const ready = parts.filter((p) => p.status === 'ready' && p.fileId);
  const characters = [...text].length;
  const tooLong = characters > MAX_TEXT_ANSWER;

  // A recording kept on this device (D43) comes back for review.
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    loadRecordingDraft(userId, draftKey).then((d) => {
      if (!live || !d) return;
      setRestored({
        blob: d.blob,
        mimeType: d.mimeType,
        seconds: d.seconds,
        extension: extensionForMime(d.mimeType),
      });
      setMode('record');
      toast.show('draft.restored');
    });
    return () => {
      live = false;
    };
  }, [userId, draftKey, toast]);

  // Leaving the screen stops uploads still running (their records expire after 24 hours).
  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const c of running.values()) c.abort();
    };
  }, []);

  /** @param {string} key @param {Partial<AnswerPart>} patch */
  const update = (key, patch) => setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  /**
   * Uploads one part now; it waits on the server for the next version.
   * @param {File} file @param {'AUDIO' | 'PDF' | 'DOCX'} role @param {number[] | null} [peaks] @param {string} [retryKey]
   */
  const startUpload = (file, role, peaks = null, retryKey) => {
    const key = retryKey ?? crypto.randomUUID();
    const controller = new AbortController();
    controllers.current.set(key, controller);
    sources.current.set(key, { file, peaks });
    request.current = null;
    /** @type {AnswerPart} */
    const fresh = {
      key,
      fileId: null,
      name: file.name,
      size: file.size,
      role,
      status: 'uploading',
      progress: 0,
      error: null,
      durationSeconds: null,
    };
    setParts((ps) => (retryKey ? ps.map((p) => (p.key === key ? fresh : p)) : [...ps, fresh]));
    /** @type {Promise<Record<string, unknown>> | undefined} */
    const finalizeLater = role === 'AUDIO' ? (peaks ? Promise.resolve({ peaks }) : computePeaks(file).then((p) => (p ? { peaks: p } : {}))) : undefined;
    uploadFile({
      resourceType: 'SUBMISSION_FILE',
      assignmentId,
      file,
      alwaysResumable: true,
      signal: controller.signal,
      finalizeLater,
      onRegistered: (fileId) => update(key, { fileId }),
      onProgress: (f) => update(key, f >= 1 ? { progress: 1, status: 'checking' } : { progress: f }),
      onResumed: () => toast.show('learner.upload-resumed'),
    })
      .then((res) => {
        const r = /** @type {{ fileId: string, durationSeconds?: number }} */ (res);
        update(key, {
          status: 'ready',
          fileId: r.fileId,
          durationSeconds: r.durationSeconds ?? null,
          error: null,
        });
      })
      .catch((/** @type {{ status?: number, code?: string, message?: string }} */ error) => {
        if (error?.code === 'cancelled') return;
        const reason = error?.message ?? 'The upload stopped. Try again.';
        if (error?.status === 422 || error?.status === 400 || error?.status === 403) {
          update(key, { status: 'rejected', error: reason });
          toast.show('learner.file-rejected', {
            params: { reason },
            onAction: () => (role === 'AUDIO' ? audioInput.current?.click() : documentInput.current?.click()),
          });
        } else {
          update(key, { status: 'failed', error: reason });
        }
      })
      .finally(() => controllers.current.delete(key));
  };

  /** @param {import('react').ChangeEvent<HTMLInputElement>} event */
  const onPick = (event) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    let room = mine.max_files - active.length;
    for (const file of picked) {
      if (room <= 0) {
        setMessage(`You can add up to ${mine.max_files} files to one answer.`);
        break;
      }
      const role = answerRoleFor(file.name);
      if (!role || (role !== 'AUDIO' && !mine.accepted_formats.includes(role))) {
        setMessage(`${file.name} cannot be added: use ${documentKinds.length ? `an audio file, or a ${documentKinds.join(' or ')} file` : 'an audio file'}.`);
        continue;
      }
      setMessage(null);
      startUpload(file, role);
      room -= 1;
    }
  };

  /** @param {AnswerPart} part */
  const remove = async (part) => {
    if (part.fileId && (part.status === 'ready' || part.status === 'failed')) {
      try {
        await removeDraftFile(part.fileId);
      } catch (error) {
        if (part.status === 'ready') {
          setMessage(/** @type {Error} */ (error).message);
          return;
        }
      }
    }
    request.current = null;
    setParts((ps) => ps.filter((p) => p.key !== part.key));
  };

  /** @param {AnswerPart} part */
  const cancel = (part) => {
    controllers.current.get(part.key)?.abort();
    if (part.fileId) void removeDraftFile(part.fileId).catch(() => undefined);
    setParts((ps) => ps.filter((p) => p.key !== part.key));
  };

  /** @param {AnswerPart} part */
  const retry = (part) => {
    const source = sources.current.get(part.key);
    if (!source) {
      void remove(part);
      return;
    }
    if (part.fileId) void removeDraftFile(part.fileId).catch(() => undefined);
    startUpload(source.file, part.role, source.peaks, part.key);
  };

  const submit = async () => {
    setMessage(null);
    if (tooLong) return setMessage(`Your text answer is longer than ${MAX_TEXT_ANSWER.toLocaleString('en-GB')} characters.`);
    if (!text.trim() && !ready.length) return setMessage('Add a text answer, a recording or a file.');
    if (uploading) return setMessage('Wait for your files to finish uploading.');
    // One id per answer: if the connection drops and Submit is pressed again, no second version is made.
    request.current ??= crypto.randomUUID();
    setBusy(true);
    try {
      const res = await submitAnswer({
        assignmentId,
        text,
        fileIds: ready.map((p) => /** @type {string} */ (p.fileId)),
        requestId: request.current,
      });
      request.current = null;
      clearTextDraft();
      if (userId) void clearRecordingDraft(userId, draftKey);
      if (res.isLate) toast.show('learner.submitted-late');
      else if (res.resubmitted)
        toast.show('learner.resubmitted', {
          params: { n: String(res.versionNumber) },
        });
      else toast.show('learner.submission-received');
      onSent();
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="answer-form-title" className="flex flex-col gap-4" data-slot="answer-form">
      <h2 id="answer-form-title" className="m-0 text-title-3 text-ink">
        {last ? 'Send a new answer' : 'Your answer'}
      </h2>
      {mine.will_be_late ? <Banner tone="warning">The due date has passed. Your answer will be accepted and marked late.</Banner> : null}
      {last ? (
        <p className="m-0 text-body-sm text-ink-secondary">
          Your new answer becomes version {mine.next_version} and is the one graded; earlier versions are kept. Files stay with the version they were sent in:
          add any you want again.
        </p>
      ) : null}

      <Tabs value={mode} onValueChange={setMode}>
        <TabsList aria-label="How to answer">
          <TabsTrigger value="write">
            <PenLine className="mr-2 size-4" aria-hidden="true" />
            Write
          </TabsTrigger>
          <TabsTrigger value="record">
            <Mic className="mr-2 size-4" aria-hidden="true" />
            Record
          </TabsTrigger>
          <TabsTrigger value="upload">
            <Upload className="mr-2 size-4" aria-hidden="true" />
            Upload
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="flex flex-col gap-2">
          <Label htmlFor="answer-text">Text answer</Label>
          <Textarea
            id="answer-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              request.current = null;
            }}
            rows={10}
            aria-describedby="answer-count"
            aria-invalid={tooLong || undefined}
          />
          <p id="answer-count" className={tooLong ? 'm-0 text-body-sm text-error' : 'm-0 text-body-sm text-ink-secondary'}>
            {characters.toLocaleString('en-GB')} of {MAX_TEXT_ANSWER.toLocaleString('en-GB')} characters
          </p>
        </TabsContent>
        {/* Kept mounted while hidden, so switching tabs never cuts a recording. */}
        <TabsContent value="record" forceMount className="data-[state=inactive]:hidden">
          {full ? (
            <p className="m-0 rounded-md bg-fill p-3 text-body-sm text-ink">
              You have added {mine.max_files} files, the most one answer can hold. Remove one to record another.
            </p>
          ) : (
            <Recorder
              onActiveChange={setRecorderActive}
              limits={recorderLimits}
              audience="learner"
              draft={recordingDraft}
              restored={restored}
              title={`Your answer: ${title}`}
              onUse={(file, { peaks }) => {
                setRestored(null);
                startUpload(file, 'AUDIO', peaks);
              }}
              onUploadInstead={() => {
                setMode('upload');
                audioInput.current?.click();
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="upload" className="flex flex-col gap-3">
          <p className="m-0 text-body-sm text-ink-secondary">
            {`Audio${audioLimit.maxBytes ? ` ${limitText(audioLimit)}` : ''}: MP3, M4A, WAV, WebM or Ogg, including your phone’s voice recordings.`}
            {documentKinds.length ? ` ${documentKinds.join(' and ')} files${docLimit.maxBytes ? ` ${limitText(docLimit)}` : ''}.` : ''}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => audioInput.current?.click()} disabled={full}>
              <Upload aria-hidden="true" />
              Upload audio
            </Button>
            {documentKinds.length ? (
              <Button type="button" variant="outline" onClick={() => documentInput.current?.click()} disabled={full}>
                <Upload aria-hidden="true" />
                Upload {documentKinds.join(' or ')}
              </Button>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
      <input ref={audioInput} type="file" accept={AUDIO_ACCEPT} multiple className="hidden" onChange={onPick} data-testid="answer-audio-input" />
      <input ref={documentInput} type="file" accept={DOCUMENT_ACCEPT} multiple className="hidden" onChange={onPick} data-testid="answer-document-input" />

      {parts.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-headline text-ink">Files in this answer</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Files in this answer">
            {parts.map((part) => (
              <UploadRow
                key={part.key}
                part={part}
                disabled={busy}
                onCancel={() => cancel(part)}
                onRetry={() => retry(part)}
                onRemove={() => void remove(part)}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <FormMessage>{message}</FormMessage>
      <div
        className={cn(
          recorderActive && mode === 'record' ? 'relative' : 'sticky bottom-above-nav lg:bottom-4',
          'z-20 flex flex-col gap-2 rounded-lg border border-hairline bg-pill p-3 blur-material sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <p className="m-0 text-body-sm text-ink-secondary">
          {[text.trim() ? 'Text' : null, ready.length ? `${ready.length} file${ready.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' and ') ||
            'Nothing added yet'}
          {uploading ? ' · uploading…' : ''}
        </p>
        <Button type="button" onClick={() => void submit()} loading={busy} loadingLabel="Sending" disabled={uploading}>
          <Send aria-hidden="true" />
          {last ? 'Submit again' : 'Submit'}
        </Button>
      </div>
    </section>
  );
}
