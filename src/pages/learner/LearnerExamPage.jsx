import { ArrowLeft, CheckCircle2, CircleDashed, CloudOff, FileText, Mic, Send, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { FormSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { ExamDocumentLink } from '@/components/exams/ExamDocumentLink.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Recorder } from '@/components/recorder/Recorder.jsx';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Label } from '@/components/ui/label.jsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue } from '@/lib/assignments/due.js';
import { audioUrl, fetchExamFiles, fetchMyExam, LEARNER_STATE, saveExamAnswers, startExam, submitExam } from '@/lib/exams/exams.js';
import { formatPercentage } from '@/lib/grading/grading.js';
import { LEARNER_RECORDING } from '@/lib/recording/format.js';
import { limitFor, limitText, recordingLimits, useClientSettings } from '@/lib/settings/client-settings.js';
import { uploadFile } from '@/lib/uploads.js';

// The learner's examination (Phase 10.1, ADR-016; owner request and answers of 2026-11-10). Before it
// opens: its details. Once open: the instructions, the total and pass mark, and Start. While taking it:
// the sections one at a time (tabs), multiple choice A to D, short answers and essays typed, recorded or uploaded (audio, PDF or Word),
// saved automatically as they go (a saving indicator; answers kept on this device while offline and sent
// when the connection is back), Review, then Submit after a confirmation. There is NO countdown timer:
// only the closing time is shown, and the server refuses work after it. After submitting, the answers;
// once released, the marks, result and feedback.

/** @typedef {import('@/lib/exams/exams.js').MyExam} Exam */
/** @typedef {{ selected_option?: string | null, text_answer?: string, audio_file_ids?: string[], document_file_id?: string | null }} Draft */
/** @typedef {import('@/lib/exams/exams.js').ExamAnswerFile} AnswerFile */

const SAVE_AFTER_MS = 1200;
/** Recordings or audio files one answer can hold (owner request of 2026-11-11; the database enforces it). */
const MAX_ANSWER_AUDIO = 3;

/**
 * A draft kept by an earlier version of this page held one audio_file_id: read it as a list of one.
 * @param {Draft & { audio_file_id?: string | null }} d
 * @returns {Draft}
 */
function modernDraft(d) {
  if (!('audio_file_id' in d)) return d;
  const { audio_file_id: one, ...rest } = d;
  return rest.audio_file_ids ? rest : { ...rest, audio_file_ids: one ? [one] : [] };
}
const OPTIONS = /** @type {const} */ (['A', 'B', 'C', 'D']);

/** Answers waiting to be sent, kept in this browser until the server has them (a convenience: the server is the record). */
const backupKey = (/** @type {string} */ examId, /** @type {string} */ userId) => `ddtc.exam.${examId}.${userId}`;
/** @param {string} key @returns {Record<string, Draft>} */
function readBackup(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}
/** @param {string} key @param {Record<string, Draft>} value */
function writeBackup(key, value) {
  try {
    if (Object.keys(value).length) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
  } catch {
    // storage unavailable: answers are still sent to the server as usual
  }
}

export default function LearnerExamPage() {
  const { courseId = '', examId = '' } = useParams();
  const auth = useAuth();
  const me = auth.profile?.id ?? '';
  const page = useLoad(async () => {
    const [exam, files] = await Promise.all([fetchMyExam(examId), fetchExamFiles(examId, me)]);
    return { exam, files };
  }, [examId, me]);

  if (page.state === 'error') return <ErrorState title="The examination could not be loaded" onRetry={page.reload} />;
  const exam = page.data?.exam ?? null;
  if (page.state === 'ready' && !exam) return <EmptyState title="Examination not found" description="It may not be open to you, or you are not enrolled in this course." />;
  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<FormSkeleton fields={5} />} onRetry={page.reload}>
      {exam ? (
        <div className="flex flex-col gap-4">
          <Link to={`/learner/courses/${courseId}`} className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the course
          </Link>
          <PageHeader title={exam.title} description={exam.description || 'End-of-course examination'} className="pb-0" />
          <Facts exam={exam} />
          {exam.state === 'IN_PROGRESS' ? (
            <Taking exam={exam} userId={me} files={page.data?.files ?? []} onSubmitted={page.reload} />
          ) : (
            <Outside exam={exam} files={page.data?.files ?? []} onStarted={page.reload} />
          )}
        </div>
      ) : null}
    </LoadingRegion>
  );
}

/** The examination's facts: state, opening and closing time (Ghana time), marks, pass mark. No countdown. @param {{ exam: Exam }} props */
function Facts({ exam }) {
  const s = LEARNER_STATE[exam.state];
  return (
    <Card className="flex flex-col gap-2" data-slot="exam-facts">
      <span>
        <StatusChip tone={s.tone}>{s.label}</StatusChip>
      </span>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-1 text-body sm:grid-cols-2">
        <div className="flex flex-wrap gap-2">
          <dt className="text-ink-secondary">Opens</dt>
          <dd className="m-0 tabular-nums text-ink">{`${formatDue(exam.opens_at)} (Ghana time)`}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-ink-secondary">Submit by</dt>
          <dd className="m-0 tabular-nums text-ink" data-testid="exam-deadline">{`${formatDue(exam.closes_at)} (Ghana time)`}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-ink-secondary">Total marks</dt>
          <dd className="m-0 tabular-nums text-ink">{Number(exam.total_marks)}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-ink-secondary">Pass mark</dt>
          <dd className="m-0 tabular-nums text-ink">{`${exam.pass_mark}%`}</dd>
        </div>
      </dl>
      <CardDescription>There is no time limit. Work at your own pace and submit before the deadline.</CardDescription>
    </Card>
  );
}

/** Before, after or outside the examination window. @param {{ exam: Exam, files: AnswerFile[], onStarted: () => void }} props */
function Outside({ exam, files, onStarted }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const start = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await startExam(exam.id);
      onStarted();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {exam.instructions ? (
        <Card className="flex flex-col gap-2">
          <CardTitle>Instructions</CardTitle>
          <p className="m-0 whitespace-pre-wrap text-body text-ink">{exam.instructions}</p>
        </Card>
      ) : null}
      {exam.state === 'OPEN' ? (
        <div className="flex flex-col gap-2">
          <Button className="self-start" onClick={() => void start()} loading={busy} loadingLabel="Starting">
            {exam.attempt_number && exam.attempt_number > 1 ? 'Start your retake' : 'Start examination'}
          </Button>
          <FormMessage>{message}</FormMessage>
        </div>
      ) : null}
      {exam.state === 'UPCOMING' ? <p className="m-0 text-body text-ink-secondary">{`You can start it from ${formatDue(exam.opens_at)} (Ghana time).`}</p> : null}
      {exam.state === 'SUBMITTED' && exam.submitted_at ? (
        <p className="m-0 flex items-center gap-2 text-body text-ink" role="status">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          {`Submitted ${formatDue(exam.submitted_at)} (Ghana time). ${exam.result ? '' : 'Your result appears here once your lecturer releases it.'}`}
        </p>
      ) : null}
      {exam.state === 'NOT_SUBMITTED' ? (
        <p className="m-0 text-body text-ink" role="status">
          The deadline passed before you submitted. Your saved answers are kept for your lecturer.
        </p>
      ) : null}
      {exam.result ? <ResultCard result={exam.result} /> : null}
      {exam.sections ? <Answers exam={exam} files={files} /> : null}
    </div>
  );
}

/** @param {{ result: NonNullable<Exam['result']> }} props */
function ResultCard({ result }) {
  return (
    <Card className="flex flex-col gap-2" aria-labelledby="exam-result-title" data-slot="exam-result">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CardTitle id="exam-result-title">Your result</CardTitle>
        <StatusChip tone={result.passed ? 'success' : 'warning'}>{result.passed ? 'Pass' : 'Not passed'}</StatusChip>
      </div>
      <span className="text-title-1 tabular-nums text-ink" data-testid="exam-result">
        {`${Number(result.total_score)} / ${Number(result.total_marks)} · ${formatPercentage(result.percentage)}`}
      </span>
      {result.feedback ? <p className="m-0 whitespace-pre-wrap text-body text-ink">{result.feedback}</p> : null}
      <CardDescription>{`Released ${formatDue(result.released_at)}${result.attempt_number > 1 ? ` · attempt ${result.attempt_number}` : ''}.`}</CardDescription>
    </Card>
  );
}

/** The learner's answers, read-only, with marks and feedback once released. @param {{ exam: Exam, files: AnswerFile[] }} props */
function Answers({ exam, files }) {
  return (
    <div className="flex flex-col gap-4">
      {(exam.sections ?? []).map((s) => (
        <section key={s.id} aria-labelledby={`answers-${s.id}`} className="flex flex-col gap-3">
          <h2 id={`answers-${s.id}`} className="m-0 text-title-3 text-ink">
            {s.title}
          </h2>
          {s.questions.map((q, i) => {
            const recs = files.filter((a) => a.question_id === q.id && a.kind === 'AUDIO');
            const doc = files.find((a) => a.question_id === q.id && a.kind === 'DOCUMENT');
            return (
              <Card key={q.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="whitespace-pre-wrap break-words">{`${i + 1}. ${q.prompt}`}</CardTitle>
                  <span className="text-body-sm tabular-nums text-ink-secondary">
                    {q.answer.score === undefined ? `${Number(q.marks)} marks` : `${Number(q.answer.score)} / ${Number(q.marks)}`}
                  </span>
                </div>
                {q.kind === 'MCQ' ? (
                  <p className="m-0 text-body text-ink">{q.answer.selected_option ? `Your answer: ${q.answer.selected_option}. ${q.options?.[/** @type {'A'} */ (q.answer.selected_option)] ?? ''}` : 'No answer chosen.'}</p>
                ) : (
                  <>
                    {q.answer.text_answer ? <p className="m-0 whitespace-pre-wrap break-words rounded-md bg-fill p-3 text-body text-ink">{q.answer.text_answer}</p> : null}
                    {recs.map((rec, n) => (
                      <RecordedAnswer
                        key={rec.file_id}
                        bucket={rec.bucket}
                        path={rec.storage_path}
                        label={recs.length > 1 ? `Your recorded answer ${n + 1} of ${recs.length} to question ${i + 1}` : `Your recorded answer to question ${i + 1}`}
                      />
                    ))}
                    {doc ? <ExamDocumentLink file={doc} /> : null}
                    {!q.answer.text_answer && !recs.length && !doc ? <p className="m-0 text-body-sm text-ink-secondary">No answer given.</p> : null}
                  </>
                )}
                {q.answer.feedback ? <p className="m-0 whitespace-pre-wrap text-body-sm text-ink-secondary">{`Feedback: ${q.answer.feedback}`}</p> : null}
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** @param {{ bucket: string, path: string, label: string }} props */
function RecordedAnswer({ bucket, path, label }) {
  const [src, setSrc] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    let live = true;
    audioUrl(bucket, path)
      .then((u) => live && setSrc(u))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [bucket, path]);
  return src ? <audio controls preload="metadata" src={src} aria-label={label} className="w-full" /> : null;
}

/**
 * Taking the examination: sections as tabs, autosave with an indicator, offline backup, review and submit.
 * @param {{ exam: Exam, userId: string, files: AnswerFile[], onSubmitted: () => void }} props
 */
function Taking({ exam, userId, files, onSubmitted }) {
  const toast = useToast();
  const sections = exam.sections ?? [];
  const key = backupKey(exam.id, userId);
  /** The answers on screen: the server's, with anything still waiting in this browser on top. */
  const [answers, setAnswers] = useState(() => {
    /** @type {Record<string, Draft>} */
    const start = {};
    for (const s of sections) for (const q of s.questions) start[q.id] = { selected_option: q.answer.selected_option ?? null, text_answer: q.answer.text_answer ?? '' };
    for (const a of files) {
      if (!start[a.question_id]) continue;
      if (a.kind === 'AUDIO') start[a.question_id] = { ...start[a.question_id], audio_file_ids: [...(start[a.question_id].audio_file_ids ?? []), a.file_id] };
      else start[a.question_id] = { ...start[a.question_id], document_file_id: a.file_id };
    }
    const waiting = readBackup(key);
    for (const [id, d] of Object.entries(waiting)) if (start[id]) start[id] = { ...start[id], ...modernDraft(d) };
    return start;
  });
  const pending = useRef(/** @type {Record<string, Draft>} */ (Object.fromEntries(Object.entries(readBackup(key)).map(([id, d]) => [id, modernDraft(d)]))));
  const [saveState, setSaveState] = useState(/** @type {{ kind: 'saved' | 'saving' | 'offline' | 'error', at?: string, message?: string }} */ ({ kind: 'saved' }));
  const [tab, setTab] = useState(sections[0]?.id ?? '');
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  const flush = useCallback(async () => {
    const batch = pending.current;
    const ids = Object.keys(batch);
    if (!ids.length) return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSaveState({ kind: 'offline' });
      return false;
    }
    setSaveState({ kind: 'saving' });
    try {
      const res = await saveExamAnswers(
        exam.id,
        ids.map((id) => ({
          questionId: id,
          ...(batch[id].selected_option !== undefined ? { selectedOption: /** @type {any} */ (batch[id].selected_option) } : {}),
          ...(batch[id].text_answer !== undefined ? { textAnswer: batch[id].text_answer } : {}),
          ...(batch[id].audio_file_ids !== undefined ? { audioFileIds: batch[id].audio_file_ids } : {}),
          ...(batch[id].document_file_id !== undefined ? { documentFileId: batch[id].document_file_id } : {}),
        })),
      );
      for (const id of ids) if (pending.current[id] === batch[id]) delete pending.current[id];
      writeBackup(key, pending.current);
      setSaveState({ kind: 'saved', at: res.savedAt });
      return true;
    } catch (e) {
      const err = /** @type {{ status?: number, message?: string }} */ (e);
      // A refusal (deadline passed, already submitted) is final; anything else is kept and retried.
      setSaveState(err.status && err.status < 500 ? { kind: 'error', message: err.message } : { kind: 'offline' });
      return false;
    }
  }, [exam.id, key]);

  // Send waiting answers when the page opens and whenever the connection comes back.
  useEffect(() => {
    const online = () => void flush();
    window.addEventListener('online', online);
    const first = setTimeout(online, 0);
    return () => {
      clearTimeout(first);
      window.removeEventListener('online', online);
    };
  }, [flush]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** @param {string} id @param {Draft} change */
  const change = (id, change) => {
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...change } }));
    pending.current = { ...pending.current, [id]: { ...pending.current[id], ...change } };
    writeBackup(key, pending.current);
    setSaveState({ kind: 'saving' });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  };

  const answered = (/** @type {string} */ id) => {
    const a = answers[id] ?? {};
    return Boolean(a.selected_option || a.text_answer?.trim() || a.audio_file_ids?.length || a.document_file_id);
  };
  const all = sections.flatMap((s) => s.questions);
  const done = all.filter((q) => answered(q.id)).length;
  const index = sections.findIndex((s) => s.id === tab);

  const submit = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      if (!(await flush()) && Object.keys(pending.current).length) throw new Error('Some answers are not saved yet. Check your connection and try again.');
      await submitExam(exam.id);
      writeBackup(key, {});
      toast.show('learner.exam-submitted');
      setReviewing(false);
      onSubmitted();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-slot="exam-taking">
      {exam.instructions ? (
        <details className="rounded-md border border-hairline bg-card p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-label text-link focus-visible:focus-ring">Instructions</summary>
          <p className="m-0 whitespace-pre-wrap text-body text-ink">{exam.instructions}</p>
        </details>
      ) : null}
      <SaveIndicator state={saveState} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Sections">
          {sections.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.title}
            </TabsTrigger>
          ))}
        </TabsList>
      {sections.map((s) => (
          <TabsContent key={s.id} value={s.id}>
          <section aria-labelledby={`take-${s.id}`} className="flex flex-col gap-3">
            <h2 id={`take-${s.id}`} className="m-0 text-title-3 text-ink">
              {s.title}
            </h2>
            {s.instructions ? <p className="m-0 whitespace-pre-wrap text-body-sm text-ink-secondary">{s.instructions}</p> : null}
            {s.questions.map((q, i) => (
              <Card key={q.id} className="flex flex-col gap-3" data-slot="exam-answer" data-kind={q.kind}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle id={`q-${q.id}`} className="whitespace-pre-wrap break-words">{`${i + 1}. ${q.prompt}`}</CardTitle>
                  <span className="text-body-sm tabular-nums text-ink-secondary">{`${Number(q.marks)} marks`}</span>
                </div>
                {q.kind === 'MCQ' && q.options ? (
                  <RadioGroup value={answers[q.id]?.selected_option ?? ''} onValueChange={(v) => change(q.id, { selected_option: v })} aria-labelledby={`q-${q.id}`}>
                    {OPTIONS.map((o) => (
                      <div key={o} className="flex min-h-11 items-center gap-3">
                        <RadioGroupItem id={`q-${q.id}-${o}`} value={o} />
                        <Label htmlFor={`q-${q.id}-${o}`} className="text-body">{`${o}. ${q.options?.[o] ?? ''}`}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : (
                  <WrittenAnswer
                    examId={exam.id}
                    question={q}
                    value={answers[q.id] ?? {}}
                    files={files.filter((a) => a.question_id === q.id)}
                    onChange={(c) => change(q.id, c)}
                  />
                )}
              </Card>
            ))}
          </section>
          </TabsContent>
        ))}
      </Tabs>
      <div className="sticky bottom-above-nav z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline bg-card p-3 lg:static">
        <span className="text-body-sm text-ink-secondary tabular-nums">{`${done} of ${all.length} answered`}</span>
        <span className="flex flex-wrap gap-2">
          {index > 0 ? (
            <Button variant="ghost" onClick={() => setTab(sections[index - 1].id)}>
              Previous section
            </Button>
          ) : null}
          {index < sections.length - 1 ? (
            <Button variant="outline" onClick={() => setTab(sections[index + 1].id)}>
              Next section
            </Button>
          ) : null}
          <Button onClick={() => setReviewing(true)}>
            <Send aria-hidden="true" />
            Review and submit
          </Button>
        </span>
      </div>
      {reviewing ? (
        <AlertDialog open onOpenChange={(open) => !open && !submitting && setReviewing(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit your examination?</AlertDialogTitle>
              <AlertDialogDescription>{`You have answered ${done} of ${all.length} questions. Once you submit, you cannot change your answers.`}</AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-y-auto p-0 focus-visible:focus-ring" tabIndex={0} aria-label="Your answers">
              {sections.flatMap((s) =>
                s.questions.map((q, i) => (
                  <li key={q.id} className="flex items-center gap-2 text-body-sm">
                    {answered(q.id) ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" /> : <CircleDashed className="size-4 shrink-0 text-warning" aria-hidden="true" />}
                    <span className="min-w-0 truncate">{`${s.title}, question ${i + 1}: ${answered(q.id) ? 'answered' : 'not answered'}`}</span>
                  </li>
                )),
              )}
            </ul>
            <FormMessage>{message}</FormMessage>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost" disabled={submitting}>
                  Keep working
                </Button>
              </AlertDialogCancel>
              <Button onClick={() => void submit()} loading={submitting} loadingLabel="Submitting">
                Submit examination
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

/** The saving indicator (never a countdown). @param {{ state: { kind: 'saved' | 'saving' | 'offline' | 'error', at?: string, message?: string } }} props */
function SaveIndicator({ state }) {
  return (
    <p role="status" aria-live="polite" className="m-0 flex min-h-6 items-center gap-2 text-body-sm text-ink-secondary" data-testid="save-state">
      {state.kind === 'saving' ? 'Saving…' : null}
      {state.kind === 'saved' ? (state.at ? `All answers saved at ${new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Africa/Accra' }).format(new Date(state.at))}` : 'All answers saved') : null}
      {state.kind === 'offline' ? (
        <>
          <CloudOff className="size-4" aria-hidden="true" />
          You are offline. Your answers are kept on this device and will be saved when you are back online.
        </>
      ) : null}
      {state.kind === 'error' ? <span className="text-error">{state.message}</span> : null}
    </p>
  );
}

const AUDIO_ACCEPT = '.mp3,.m4a,.mp4,.wav,.webm,.weba,.ogg,.oga,.opus,audio/*';
const DOCUMENT_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * A short answer or essay: typed, and (owner answer 8; Step 10.3) one audio answer, recorded or an
 * uploaded file, and one PDF or Word document. The Record button has a red border (owner request).
 * @param {{ examId: string, question: NonNullable<Exam['sections']>[number]['questions'][number], value: Draft,
 *   files: AnswerFile[], onChange: (d: Draft) => void }} props
 */
function WrittenAnswer({ examId, question: q, value, files, onChange }) {
  const toast = useToast();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(/** @type {null | 'audio' | 'document'} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  /** Files added on this visit, known before the page's own list is read again. */
  const [added, setAdded] = useState(/** @type {AnswerFile[]} */ ([]));
  /** The place (0 to 2) of the recording being replaced, or null when the next one is added at the end. */
  const [replacing, setReplacing] = useState(/** @type {number | null} */ (null));
  const audioInput = useRef(/** @type {HTMLInputElement | null} */ (null));
  const documentInput = useRef(/** @type {HTMLInputElement | null} */ (null));
  // Limits from Settings (the server checks again, D18).
  const settings = useClientSettings();
  const audioLimit = limitFor(settings, 'submission_audio');
  const docLimit = limitFor(settings, 'submission_document');
  const recorderLimits = useMemo(() => recordingLimits(settings, 'submission_audio', LEARNER_RECORDING), [settings]);
  const known = (/** @type {string} */ id) => added.find((f) => f.file_id === id) ?? files.find((f) => f.file_id === id) ?? null;
  const audioIds = value.audio_file_ids ?? [];
  const doc = value.document_file_id ? known(value.document_file_id) : null;
  const full = audioIds.length >= MAX_ANSWER_AUDIO;
  const mayAddAudio = replacing !== null || !full;

  /** @param {File} file @param {'audio' | 'document'} kind @param {boolean} recorded */
  const attach = async (file, kind, recorded) => {
    setUploading(kind);
    setMessage(null);
    try {
      const res = /** @type {{ fileId: string, bucket?: string, storagePath?: string, mimeType?: string, durationSeconds?: number }} */ (
        await uploadFile({
          resourceType: kind === 'audio' ? 'EXAM_ANSWER_AUDIO' : 'EXAM_ANSWER_DOCUMENT',
          examId,
          questionId: q.id,
          file,
          alwaysResumable: kind === 'audio',
          onResumed: () => toast.show('learner.upload-resumed'),
        })
      );
      setAdded((list) => [
        ...list,
        {
          question_id: q.id,
          kind: kind === 'audio' ? 'AUDIO' : 'DOCUMENT',
          file_id: res.fileId,
          bucket: res.bucket ?? '',
          storage_path: res.storagePath ?? '',
          original_filename: file.name,
          safe_download_filename: file.name,
          duration_seconds: res.durationSeconds ?? null,
          mime_type: res.mimeType ?? file.type,
        },
      ]);
      if (kind === 'audio') {
        const next = replacing !== null && replacing < audioIds.length ? audioIds.map((id, i) => (i === replacing ? res.fileId : id)) : [...audioIds, res.fileId].slice(0, MAX_ANSWER_AUDIO);
        onChange({ audio_file_ids: next });
        setReplacing(null);
        setRecording(false);
        if (recorded) toast.show('learner.recording-saved');
      } else {
        onChange({ document_file_id: res.fileId });
      }
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setUploading(null);
    }
  };
  /** @param {import('react').ChangeEvent<HTMLInputElement>} e @param {'audio' | 'document'} kind */
  const pick = (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void attach(file, kind, false);
  };
  /** @param {number} index */
  const removeAudio = (index) => {
    onChange({ audio_file_ids: audioIds.filter((_, i) => i !== index) });
    setReplacing(null);
    setRecording(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={`a-${q.id}`}>{q.kind === 'ESSAY' ? 'Your essay' : 'Your answer'}</Label>
      <Textarea id={`a-${q.id}`} value={value.text_answer ?? ''} onChange={(e) => onChange({ text_answer: e.target.value })} rows={q.kind === 'ESSAY' ? 12 : 3} maxLength={50000} />

      {audioIds.length ? (
        <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Your audio answers" data-testid="exam-audio-list">
          {audioIds.map((id, i) => {
            const audio = known(id);
            const name = `Audio answer ${i + 1}`;
            return (
              <li key={id} className="flex flex-col gap-2 rounded-md bg-fill p-3" data-testid="exam-audio-item">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-label text-ink">{`${name} of ${audioIds.length}`}</span>
                  {replacing === i ? <StatusChip tone="warning">Being replaced</StatusChip> : null}
                </div>
                {audio && audio.bucket ? <RecordedAnswer bucket={audio.bucket} path={audio.storage_path} label={name} /> : <StatusChip tone="success">Audio answer attached</StatusChip>}
                <div className="flex flex-wrap gap-2">
                  {replacing === i ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setReplacing(null);
                        setRecording(false);
                      }}
                      disabled={uploading !== null}
                    >
                      Keep this one
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => setReplacing(i)} disabled={uploading !== null} aria-label={`Replace ${name.toLowerCase()}`}>
                      Replace
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => removeAudio(i)} disabled={uploading !== null} aria-label={`Remove ${name.toLowerCase()}`}>
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {replacing !== null ? (
        <p className="m-0 text-body-sm text-ink" role="status">{`Record or upload the audio that takes the place of audio answer ${replacing + 1}.`}</p>
      ) : null}

      {recording && mayAddAudio ? (
        <Recorder
          limits={recorderLimits}
          audience="learner"
          title={`Your answer to: ${q.prompt.slice(0, 60)}`}
          disabled={uploading !== null}
          onUse={(file) => void attach(file, 'audio', true)}
          onUploadInstead={() => audioInput.current?.click()}
        />
      ) : null}

      {value.document_file_id ? (
        <div className="flex flex-wrap items-center gap-2">
          {doc && doc.bucket ? <ExamDocumentLink file={doc} /> : <StatusChip tone="success">{doc ? `Document attached: ${doc.original_filename}` : 'Document attached'}</StatusChip>}
          <Button variant="ghost" onClick={() => documentInput.current?.click()} disabled={uploading !== null}>
            Replace document
          </Button>
          <Button variant="ghost" onClick={() => onChange({ document_file_id: null })} disabled={uploading !== null}>
            Remove document
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {mayAddAudio && !recording ? (
          <>
            <Button variant="outline" className="border-2 border-error" onClick={() => setRecording(true)} disabled={uploading !== null}>
              <Mic className="text-error" aria-hidden="true" />
              {replacing !== null ? 'Record the replacement' : audioIds.length ? 'Record another answer' : 'Record your answer'}
            </Button>
            <Button variant="outline" onClick={() => audioInput.current?.click()} loading={uploading === 'audio'} loadingLabel="Uploading audio" disabled={uploading !== null}>
              <Upload aria-hidden="true" />
              {replacing !== null ? 'Upload the replacement' : audioIds.length ? 'Upload another audio file' : 'Upload an audio file'}
            </Button>
          </>
        ) : null}
        {!value.document_file_id ? (
          <Button variant="outline" onClick={() => documentInput.current?.click()} loading={uploading === 'document'} loadingLabel="Uploading document" disabled={uploading !== null}>
            <FileText aria-hidden="true" />
            Upload a PDF or Word file
          </Button>
        ) : null}
      </div>
      {full && replacing === null ? (
        <p className="m-0 text-body-sm text-ink" role="status">{`You have added ${MAX_ANSWER_AUDIO} audio answers, the most one answer can hold. Replace or remove one to add another.`}</p>
      ) : null}
      <p className="m-0 text-body-sm text-ink-secondary">{`Up to ${MAX_ANSWER_AUDIO} recordings or audio files (MP3, M4A, WAV, WebM or Ogg${audioLimit.maxBytes ? `, each ${limitText(audioLimit)}` : ''}) and one PDF or Word (.docx) document${docLimit.maxBytes ? `, ${limitText(docLimit)}` : ''}.`}</p>
      <input ref={audioInput} type="file" accept={AUDIO_ACCEPT} className="hidden" onChange={(e) => pick(e, 'audio')} data-testid="exam-audio-input" aria-label="Choose an audio file" />
      <input ref={documentInput} type="file" accept={DOCUMENT_ACCEPT} className="hidden" onChange={(e) => pick(e, 'document')} data-testid="exam-document-input" aria-label="Choose a PDF or Word file" />
      <FormMessage>{message}</FormMessage>
    </div>
  );
}
