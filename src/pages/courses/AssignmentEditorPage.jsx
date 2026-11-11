import { Archive, ArrowLeft, Mic, RotateCcw } from 'lucide-react';
import { lazy, Suspense, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AudioPlayer } from '@/components/audio/AudioPlayer.jsx';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { FormSkeleton, LessonPageSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { Label } from '@/components/ui/label.jsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useDraftAutosave, useDraftStart } from '@/hooks/use-draft.js';
import { useLoad } from '@/hooks/use-load.js';
import {
  CONTENT_TYPE_LABEL,
  fetchAssignment,
  fetchCategories,
  fetchInstructionAudio,
  saveAssignment,
  setAssignmentArchived,
  setAssignmentPublished,
} from '@/lib/assignments/assignments.js';
import { fromGhanaInput, toGhanaInput } from '@/lib/assignments/due.js';
import { answerFormats, assignmentSchema, publishProblem } from '@/lib/assignments/schemas.js';
import { computePeaks } from '@/lib/audio/peaks.js';
import { validate } from '@/lib/auth/schemas.js';
import { fetchCourse } from '@/lib/courses/courses.js';
import { downloadMedia, fetchLessons, playbackUrl } from '@/lib/lessons/lessons.js';
import { limitFor, limitText, tooLarge, useClientSettings } from '@/lib/settings/client-settings.js';
import { uploadFile } from '@/lib/uploads.js';

// Assignment editor for the course's lecturers and administrators (Phase 7; D12, D17, D18, D29,
// ADR-009): title, description, linked lesson, category, how the instructions are given (text,
// audio, or both) with the rich-text instructions and the instruction audio, due date and time in
// Ghana time, late work, maximum marks, the answer formats (text and audio always, PDF and Word on
// request) and grading criteria. Save, Publish (which saves first) and Archive in a sticky action
// bar. Changing a published assignment keeps a snapshot with the reason given. An archived course or
// assignment is read-only.

const RichTextEditor = lazy(() => import('@/components/lessons/RichTextEditor.jsx'));
const AUDIO_ACCEPT = '.mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav';
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav'];
const TYPES = /** @type {const} */ (['TEXT', 'AUDIO', 'TEXT_AND_AUDIO']);

/** @param {string} name */
const extension = (name) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
/** A week from now at 23:59, Ghana time (GMT). */
const defaultDue = () => `${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T23:59`;

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function AssignmentEditorPage({ role }) {
  const { courseId = '', assignmentId = 'new' } = useParams();
  const isNew = assignmentId === 'new';
  const data = useLoad(async () => {
    const [course, assignment, categories, lessons] = await Promise.all([
      fetchCourse(courseId),
      isNew ? Promise.resolve(null) : fetchAssignment(assignmentId),
      fetchCategories(courseId),
      fetchLessons(courseId),
    ]);
    return { course, assignment, categories, lessons };
  }, [courseId, assignmentId]);

  if (data.state === 'error') return <ErrorState title="The assignment could not be loaded" onRetry={data.reload} />;
  if (data.state === 'ready' && (!data.data?.course || (!isNew && !data.data?.assignment))) {
    return <EmptyState title="Assignment not found" description="It may not exist, or you do not teach this course." />;
  }
  return (
    <LoadingRegion loading={data.state === 'loading'} skeleton={<FormSkeleton fields={6} />} onRetry={data.reload}>
      {data.data?.course ? (
        <Editor
          key={assignmentId}
          role={role}
          course={data.data.course}
          assignment={data.data.assignment}
          categories={data.data.categories}
          lessons={data.data.lessons}
          onChanged={data.reload}
        />
      ) : null}
    </LoadingRegion>
  );
}

/**
 * @param {{ role: 'admin' | 'lecturer', course: import('@/lib/courses/courses.js').Course, assignment: import('@/lib/assignments/assignments.js').Assignment | null,
 *   categories: import('@/lib/assignments/assignments.js').Category[], lessons: import('@/lib/lessons/lessons.js').LessonSummary[], onChanged: () => void }} props
 */
function Editor({ role, course, assignment, categories, lessons, onChanged }) {
  const navigate = useNavigate();
  const toast = useToast();
  // Unsaved fields are kept as a draft on this device and put back after an idle sign-out (D43).
  const draftKey = `assignment:${course.id}:${assignment?.id ?? 'new'}`;
  const [saved, setSaved] = useState(() => ({
    title: assignment?.title ?? '',
    description: assignment?.description ?? '',
    lessonId: assignment?.lesson_id ?? '',
    categoryId: assignment?.category_id ?? categories.find((c) => c.part === 'ASSIGNMENTS')?.id ?? categories[0]?.id ?? '',
    contentType: /** @type {'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO'} */ (assignment?.content_type ?? 'TEXT'),
    textInstructions: assignment?.text_instructions ?? '',
    dueAt: assignment ? toGhanaInput(assignment.due_at) : defaultDue(),
    allowLate: assignment?.allow_late ?? false,
    maxMarks: assignment ? String(Number(assignment.max_marks)) : '100',
    pdf: assignment?.accepted_formats.includes('PDF') ?? false,
    docx: assignment?.accepted_formats.includes('DOCX') ?? false,
    gradingCriteria: assignment?.grading_criteria ?? '',
  }));
  const start = useDraftStart(draftKey, saved, { isNew: !assignment });
  const [title, setTitle] = useState(start.title);
  const [description, setDescription] = useState(start.description);
  const [lessonId, setLessonId] = useState(start.lessonId);
  const [categoryId, setCategoryId] = useState(start.categoryId);
  const [contentType, setContentType] = useState(start.contentType);
  const [textInstructions, setTextInstructions] = useState(start.textInstructions);
  const [dueAt, setDueAt] = useState(start.dueAt);
  const [allowLate, setAllowLate] = useState(start.allowLate);
  const [maxMarks, setMaxMarks] = useState(start.maxMarks);
  const [pdf, setPdf] = useState(start.pdf);
  const [docx, setDocx] = useState(start.docx);
  const [gradingCriteria, setGradingCriteria] = useState(start.gradingCriteria);
  const current = { title, description, lessonId, categoryId, contentType, textInstructions, dueAt, allowLate, maxMarks, pdf, docx, gradingCriteria };
  const clearDraft = useDraftAutosave(draftKey, saved, current, { isNew: !assignment });
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(/** @type {null | 'save' | 'publish' | 'archive'} */ (null));
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [hasAudio, setHasAudio] = useState(Boolean(assignment?.instruction_audio_file_id));

  const courseArchived = course.status === 'ARCHIVED';
  const archived = Boolean(assignment?.archived_at);
  const readOnly = courseArchived || archived;
  const published = assignment?.publication_status === 'PUBLISHED';
  const back = `/${role}/courses/${course.id}/assignments`;
  const usesText = contentType !== 'AUDIO';
  const usesAudio = contentType !== 'TEXT';

  /** Saves the form; returns the assignment id, or null when something needs fixing. @param {boolean} quiet */
  const save = async (quiet) => {
    setMessage(null);
    const result = validate(assignmentSchema, { title, categoryId, contentType, dueAt, maxMarks, description, gradingCriteria });
    if (!result.ok) {
      setErrors(result.errors);
      return null;
    }
    setErrors({});
    try {
      const res = await saveAssignment({
        courseId: course.id,
        assignmentId: assignment?.id,
        reason: published ? reason.trim() : undefined,
        fields: {
          title: result.data.title,
          description,
          lessonId: lessonId || null,
          categoryId,
          contentType,
          textInstructions: usesText ? textInstructions : '',
          dueAt: fromGhanaInput(dueAt),
          allowLate,
          maxMarks: result.data.maxMarks,
          acceptedFormats: answerFormats({ pdf, docx }),
          gradingCriteria,
        },
      });
      setTextInstructions(res.textInstructions);
      clearDraft();
      setSaved({ ...current, textInstructions: res.textInstructions });
      setReason('');
      if (!quiet) toast.show('lecturer.assignment-saved');
      if (!assignment) navigate(`${back}/${res.assignmentId}`, { replace: true });
      return res.assignmentId;
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
      return null;
    }
  };

  const onSave = async () => {
    setBusy('save');
    await save(false);
    setBusy(null);
    if (assignment) onChanged();
  };

  /** @param {boolean} publish */
  const onPublish = async (publish) => {
    if (!assignment) return;
    setBusy('publish');
    setMessage(null);
    try {
      if (publish) {
        const problem = publishProblem({ contentType, textInstructions, hasAudio });
        if (problem) return setMessage(problem);
        if (!(await save(true))) return;
      }
      await setAssignmentPublished(assignment.id, publish);
      toast.show(publish ? 'lecturer.assignment-published' : 'lecturer.assignment-unpublished');
      onChanged();
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(null);
    }
  };

  /** @param {boolean} archive */
  const onArchive = async (archive) => {
    if (!assignment) return;
    setBusy('archive');
    setConfirmArchive(false);
    setMessage(null);
    try {
      await setAssignmentArchived(assignment.id, archive);
      if (archive) {
        toast.show('lecturer.assignment-archived', {
          onAction: async () => {
            await setAssignmentArchived(assignment.id, false);
            onChanged();
          },
        });
      } else {
        toast.show('lecturer.assignment-restored');
      }
      onChanged();
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(null);
    }
  };

  const status = archived ? { label: 'Archived', tone: /** @type {const} */ ('neutral') } : published ? { label: 'Published', tone: /** @type {const} */ ('success') } : { label: 'Draft', tone: /** @type {const} */ ('neutral') };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link to={back} className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {course.title}
        </Link>
        <PageHeader title={assignment ? assignment.title : 'New assignment'} description={course.course_code} className="pb-0" />
        {assignment ? (
          <span>
            <StatusChip tone={status.tone}>{status.label}</StatusChip>
          </span>
        ) : null}
        {courseArchived ? (
          <p role="status" className="m-0 rounded-md bg-fill p-4 text-body-sm text-ink-secondary">
            This course is archived. Its assignments are read-only.
          </p>
        ) : archived ? (
          <p role="status" className="m-0 rounded-md bg-fill p-4 text-body-sm text-ink-secondary">
            This assignment is archived: learners do not see it. Restore it to edit it again.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FormField label="Assignment title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly} error={errors.title} autoComplete="off" />
          <TextBox label="Short description (optional)" name="description" value={description} onChange={setDescription} disabled={readOnly} error={errors.description} rows={2} />
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-label text-ink">How are the instructions given?</legend>
            <RadioGroup value={contentType} onValueChange={(v) => setContentType(/** @type {typeof contentType} */ (v))} disabled={readOnly} className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              {TYPES.map((t) => (
                <div key={t} className="flex min-h-11 items-center gap-2">
                  <RadioGroupItem id={`type-${t}`} value={t} />
                  <Label htmlFor={`type-${t}`}>{CONTENT_TYPE_LABEL[t]}</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          {usesText ? (
            <Suspense fallback={<div className="min-h-64 rounded-md border border-control bg-card" aria-busy="true" />}>
              <RichTextEditor value={textInstructions} onChange={setTextInstructions} label="Instructions" disabled={readOnly} />
            </Suspense>
          ) : null}
          <TextBox label="Grading criteria (optional)" name="gradingCriteria" value={gradingCriteria} onChange={setGradingCriteria} disabled={readOnly} error={errors.gradingCriteria} rows={3} />
          {published && !readOnly ? (
            <FormField
              label="Reason for this change (optional)"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              hint="Learners already see this assignment. The reason is kept with the record of the change."
              autoComplete="off"
              maxLength={1000}
            />
          ) : null}
          <FormMessage>{message}</FormMessage>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4" aria-labelledby="details-title">
            <CardTitle id="details-title">Details</CardTitle>
            <PickField label="Category" id="category" value={categoryId} onChange={setCategoryId} disabled={readOnly} error={errors.categoryId}
              options={categories
                // Examinations are set in the Examinations tab (ADR-016); a practical is marked in person.
                .filter((c) => c.part !== 'EXAMINATIONS')
                .map((c) => ({ value: c.id, label: c.part === 'PRACTICALS' ? `${c.name} (${c.weight}%, marked in person)` : `${c.name} (${c.weight}%)` }))}
              placeholder="Choose a category" />
            <PickField label="Lesson (optional)" id="lesson" value={lessonId || 'none'} onChange={(v) => setLessonId(v === 'none' ? '' : v)} disabled={readOnly}
              options={[{ value: 'none', label: 'Not linked to a lesson' }, ...lessons.map((l) => ({ value: l.id, label: l.title }))]} />
            <FormField label="Due date and time" name="dueAt" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} disabled={readOnly} error={errors.dueAt} hint="Ghana time (GMT)." />
            <div className="flex min-h-11 items-center justify-between gap-3">
              <Label htmlFor="allow-late">Accept late answers</Label>
              <Switch id="allow-late" checked={allowLate} onCheckedChange={setAllowLate} disabled={readOnly} />
            </div>
            <FormField label="Maximum marks" name="maxMarks" inputMode="decimal" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} disabled={readOnly} error={errors.maxMarks} autoComplete="off" />
          </Card>
          <Card className="flex flex-col gap-3" aria-labelledby="answers-title">
            <CardTitle id="answers-title">Answers</CardTitle>
            <CardDescription>Learners can always answer with text or audio (recorded or uploaded). You can also accept files:</CardDescription>
            <AnswerOption id="format-text" label="Text" checked locked />
            <AnswerOption id="format-audio" label="Audio, recorded or uploaded" checked locked />
            <AnswerOption id="format-pdf" label="PDF file" checked={pdf} onChange={setPdf} disabled={readOnly} />
            <AnswerOption id="format-docx" label="Word file" checked={docx} onChange={setDocx} disabled={readOnly} />
          </Card>
          {usesAudio ? (
            assignment ? (
              <InstructionAudioCard assignmentId={assignment.id} courseId={course.id} title={assignment.title} readOnly={readOnly} onAttached={() => setHasAudio(true)} />
            ) : (
              <Card className="flex flex-col gap-2">
                <CardTitle>Instruction audio</CardTitle>
                <CardDescription>Save the assignment first, then add its audio (MP3, M4A or WAV).</CardDescription>
              </Card>
            )
          ) : null}
        </div>
      </div>

      {readOnly ? (
        archived && !courseArchived ? (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onArchive(false)} loading={busy === 'archive'} loadingLabel="Restoring">
              <RotateCcw aria-hidden="true" />
              Restore assignment
            </Button>
          </div>
        ) : null
      ) : (
        // Sticky action bar (UI_FEEDBACK: Save and Publish never use a FAB); above the phone pill bar.
        <div className="sticky bottom-above-nav z-20 flex flex-col gap-2 rounded-lg border border-hairline bg-pill p-3 blur-material sm:flex-row sm:justify-end lg:bottom-4">
          {assignment ? (
            <Button variant="ghost" className="text-error sm:mr-auto" onClick={() => setConfirmArchive(true)} disabled={busy !== null}>
              <Archive aria-hidden="true" />
              Archive
            </Button>
          ) : null}
          {assignment ? (
            <Button variant="outline" onClick={() => onPublish(!published)} loading={busy === 'publish'} loadingLabel={published ? 'Unpublishing' : 'Publishing'} disabled={busy !== null}>
              {published ? 'Unpublish' : 'Publish'}
            </Button>
          ) : null}
          <Button onClick={onSave} loading={busy === 'save'} loadingLabel="Saving" disabled={busy !== null}>
            Save assignment
          </Button>
        </div>
      )}

      <AlertDialog open={confirmArchive} onOpenChange={(open) => !open && setConfirmArchive(false)}>
        {confirmArchive ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this assignment?</AlertDialogTitle>
              <AlertDialogDescription>Learners will no longer see it. It is kept, and you can restore it at any time.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialogCancel>
              <Button variant="destructive" onClick={() => onArchive(true)}>
                Archive
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </div>
  );
}

/**
 * A labelled, controlled textarea with an inline error.
 * @param {{ label: string, name: string, value: string, onChange: (v: string) => void, disabled?: boolean, error?: string, rows?: number }} props
 */
function TextBox({ label, name, value, onChange, disabled, error, rows = 3 }) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} name={name} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
      {error ? (
        <p id={`${id}-error`} className="m-0 text-body-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A labelled select with an inline error.
 * @param {{ label: string, id: string, value: string, onChange: (v: string) => void, options: Array<{ value: string, label: string }>, disabled?: boolean, error?: string, placeholder?: string }} props
 */
function PickField({ label, id, value, onChange, options, disabled, error, placeholder }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} aria-label={label} aria-invalid={error ? true : undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="m-0 text-body-sm text-error">{error}</p> : null}
    </div>
  );
}

/**
 * One answer format: text and audio are always on (ADR-009); PDF and Word can be chosen.
 * @param {{ id: string, label: string, checked: boolean, locked?: boolean, onChange?: (v: boolean) => void, disabled?: boolean }} props
 */
function AnswerOption({ id, label, checked, locked = false, onChange, disabled }) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange?.(v === true)} disabled={locked || disabled} aria-describedby={locked ? `${id}-note` : undefined} />
      <Label htmlFor={id}>{label}</Label>
      {locked ? (
        <span id={`${id}-note`} className="text-caption text-ink-secondary">
          Always accepted
        </span>
      ) : null}
    </div>
  );
}

/**
 * The instruction audio: the current file with the player, Upload or Replace with progress (the old
 * file is kept for the record), its waveform computed in this browser while it uploads.
 * @param {{ assignmentId: string, courseId: string, title: string, readOnly: boolean, onAttached: () => void }} props
 */
function InstructionAudioCard({ assignmentId, courseId, title, readOnly, onAttached }) {
  const toast = useToast();
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const media = useLoad(() => fetchInstructionAudio(assignmentId), [assignmentId]);
  const limit = limitFor(useClientSettings(), 'instruction_audio');
  const [progress, setProgress] = useState(/** @type {null | { stage: string, fraction: number }} */ (null));
  const [problem, setProblem] = useState(/** @type {string | null} */ (null));
  const audio = media.data ?? null;

  /** @param {File} file */
  const upload = async (file) => {
    setProblem(null);
    if (!AUDIO_EXTENSIONS.includes(extension(file.name))) return setProblem('Use an MP3, M4A or WAV file.');
    const large = tooLarge(file, limit);
    if (large) return setProblem(large);
    setProgress({ stage: 'Uploading', fraction: 0 });
    try {
      const peaks = computePeaks(file).then((p) => (p ? { peaks: p } : {}));
      const res = /** @type {{ replaced: boolean }} */ (
        await uploadFile({
          resourceType: 'ASSIGNMENT_INSTRUCTION_AUDIO',
          file,
          courseId,
          assignmentId,
          finalizeLater: peaks,
          onProgress: (fraction) => setProgress({ stage: fraction < 1 ? 'Uploading' : 'Checking the file', fraction }),
        })
      );
      toast.show(res.replaced ? 'lecturer.audio-replaced' : 'lecturer.audio-ready');
      onAttached();
      media.reload();
    } catch (error) {
      const reason = /** @type {Error} */ (error).message.replace(/\.$/, '');
      toast.show('lecturer.audio-rejected', { params: { reason }, onAction: () => input.current?.click() });
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Card className="flex flex-col gap-3" aria-labelledby="instruction-audio-title">
      <CardTitle id="instruction-audio-title">Instruction audio</CardTitle>
      <LoadingRegion loading={media.state === 'loading'} skeleton={<LessonPageSkeleton />} onRetry={media.reload}>
        {audio ? (
          <AudioPlayer
            title={`Instructions: ${title}`}
            getUrl={() => playbackUrl(/** @type {any} */ (audio))}
            durationSeconds={audio.duration_seconds}
            peaks={audio.waveform_peaks}
            fileSize={audio.file_size}
            onDownload={() => downloadMedia(/** @type {any} */ (audio))}
          />
        ) : (
          <CardDescription>{`No audio yet. MP3, M4A or WAV${limit.maxBytes ? `, ${limitText(limit)}` : ''}.`}</CardDescription>
        )}
      </LoadingRegion>
      {progress ? (
        <div className="flex flex-col gap-2" role="status">
          <span className="text-body-sm text-ink-secondary">
            {progress.stage}
            {progress.stage === 'Uploading' ? ` ${Math.round(progress.fraction * 100)}%` : '…'}
          </span>
          <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.fraction * 100)} className="h-2 overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-primary transition-[width] duration-base" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {readOnly ? null : (
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
          <Button variant="outline" onClick={() => input.current?.click()} disabled={progress !== null || media.state !== 'ready'}>
            <Mic aria-hidden="true" />
            {audio ? 'Replace audio' : 'Upload audio'}
          </Button>
        </>
      )}
      <FormMessage>{problem}</FormMessage>
    </Card>
  );
}
