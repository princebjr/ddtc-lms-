import { ArrowLeft, RotateCcw, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { GradingSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { ExamDocumentLink } from '@/components/exams/ExamDocumentLink.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue, fromGhanaInput, toGhanaInput } from '@/lib/assignments/due.js';
import {
  audioUrl,
  authoriseRetake,
  fetchExamFiles,
  fetchExamResults,
  fetchExamScript,
  markExamAnswer,
  releaseExam,
  RESULT_STATE,
  saveExamFeedback,
  setExamExtension,
} from '@/lib/exams/exams.js';
import { formatPercentage } from '@/lib/grading/grading.js';
import { AnswerAudioHold } from '@/components/retention/AnswerAudioHold.jsx';

// One learner's examination script for marking (Phase 10.1, ADR-016; owner request and answers of
// 2026-11-10), for the course's lecturers and administrators: every question with the learner's answer.
// Multiple choice shows their choice and the correct one, marked automatically (final). Short answers
// and essays show the text and any recording, the marking guide, a mark from 0 to the question's marks
// and feedback, saved one by one. Then overall feedback, Release result once fully marked, and Authorise
// retake with a reason (and a new deadline for this learner). A released result changes only with a
// reason. Every figure comes from the database.

/** @typedef {import('@/lib/exams/exams.js').ScriptQuestion} Question */

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function ExamScriptPage({ role }) {
  const { courseId = '', examId = '', learnerId = '' } = useParams();
  const page = useLoad(async () => {
    const [script, results, files] = await Promise.all([fetchExamScript(examId, learnerId), fetchExamResults(examId), fetchExamFiles(examId, learnerId)]);
    return { script, row: results.find((r) => r.learner_id === learnerId) ?? null, files };
  }, [examId, learnerId]);
  const [reason, setReason] = useState('');
  const [retaking, setRetaking] = useState(false);

  if (page.state === 'error') return <ErrorState title="The script could not be loaded" onRetry={page.reload} />;
  const script = page.data?.script ?? null;
  const row = page.data?.row ?? null;
  if (page.state === 'ready' && (!script || !row)) return <EmptyState title="Script not found" description="This learner may not be in the course." />;
  const released = Boolean(script?.attempt?.released_at);
  const back = `/${role}/courses/${courseId}/exams/${examId}/results`;

  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<GradingSkeleton />} onRetry={page.reload}>
      {script && row ? (
        <div className="flex flex-col gap-4">
          <Link to={back} className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Results
          </Link>
          <PageHeader
            title={`${row.first_name} ${row.second_name}`}
            description={`Attempt ${script.attempt?.attempt_number ?? 1}. ${script.attempt?.submitted_at ? `Submitted ${formatDue(script.attempt.submitted_at)}` : 'Not submitted'} (Ghana time).`}
            className="pb-0"
          />
          <Card className="flex flex-wrap items-center justify-between gap-3" data-slot="script-summary">
            <span className="flex flex-wrap gap-2">
              <StatusChip tone={RESULT_STATE[row.state].tone}>{RESULT_STATE[row.state].label}</StatusChip>
              {released ? <StatusChip tone={row.changed_since_release ? 'warning' : 'success'}>{row.changed_since_release ? 'Changed, not released' : 'Released'}</StatusChip> : null}
            </span>
            <span className="text-headline tabular-nums text-ink" data-testid="script-total">
              {row.total_score === null ? '—' : `${Number(row.total_score)} / ${Number(row.total_marks)}${row.grading_state === 'GRADED' ? '' : ' so far'}`}
              {row.percentage === null ? '' : ` · ${formatPercentage(row.percentage)} · ${row.passed ? 'Pass' : 'Fail'}`}
            </span>
          </Card>
          {role === 'admin' && script.attempt ? <AnswerAudioHold scope="EXAM_ATTEMPT" parentId={examId} learnerId={learnerId} /> : null}
          {released ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="change-reason">Reason for changing the released result</Label>
              <Input id="change-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </div>
          ) : null}
          {(script.sections ?? []).map((s) => (
            <section key={s.id} aria-labelledby={`section-${s.id}`} className="flex flex-col gap-3">
              <h2 id={`section-${s.id}`} className="m-0 text-title-3 text-ink">
                {s.title}
              </h2>
              {s.questions.map((q, i) => (
                <QuestionMark
                  key={q.id}
                  number={i + 1}
                  question={q}
                  audios={(page.data?.files ?? []).filter((a) => a.question_id === q.id && a.kind === 'AUDIO')}
                  document={page.data?.files.find((a) => a.question_id === q.id && a.kind === 'DOCUMENT') ?? null}
                  examId={examId}
                  learnerId={learnerId}
                  reason={reason}
                  onSaved={page.reload}
                />
              ))}
            </section>
          ))}
          <OverallCard examId={examId} learnerId={learnerId} initial={script.attempt?.feedback ?? ''} reason={reason} releasable={row.grading_state === 'GRADED' && row.grade_release_status === 'DRAFT'} onSaved={page.reload} />
          <Button variant="outline" className="self-start" onClick={() => setRetaking(true)} disabled={!(row.state === 'SUBMITTED' || row.state === 'NOT_SUBMITTED')}>
            <RotateCcw aria-hidden="true" />
            Authorise retake
          </Button>
          {retaking ? <RetakeDialog examId={examId} learnerId={learnerId} name={`${row.first_name} ${row.second_name}`} closesAt={row.closes_at} onClose={() => setRetaking(false)} onDone={page.reload} /> : null}
        </div>
      ) : null}
    </LoadingRegion>
  );
}

/**
 * @param {{ number: number, question: Question, audios: Array<{ file_id: string, bucket: string, storage_path: string }>, document: import('@/lib/exams/exams.js').ExamAnswerFile | null, examId: string, learnerId: string, reason: string, onSaved: () => void }} props
 */
function QuestionMark({ number, question: q, audios, document: doc, examId, learnerId, reason, onSaved }) {
  const toast = useToast();
  const [score, setScore] = useState(q.answer?.score === null || q.answer?.score === undefined || q.answer?.auto_marked ? '' : String(Number(q.answer.score)));
  const [feedback, setFeedback] = useState(q.answer?.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const answer = q.answer;

  const save = async () => {
    const n = Number(score);
    if (score.trim() === '' || !Number.isFinite(n) || n < 0 || n > Number(q.marks) || Math.round(n * 100) !== n * 100) {
      return setMessage(`Enter a mark from 0 to ${Number(q.marks)}, with up to two decimals`);
    }
    setBusy(true);
    setMessage(null);
    try {
      await markExamAnswer({ examId, learnerId, questionId: q.id, score: n, feedback: feedback.trim(), ...(reason.trim() ? { reason: reason.trim() } : {}) });
      toast.show('lecturer.grade-draft-saved');
      onSaved();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3" data-slot="script-question" data-kind={q.kind}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CardTitle className="whitespace-pre-wrap break-words">{`${number}. ${q.prompt}`}</CardTitle>
        <span className="text-body-sm text-ink-secondary tabular-nums">{`${Number(q.marks)} marks`}</span>
      </div>
      {q.kind === 'MCQ' && q.options ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body">
            {/** @type {const} */ (['A', 'B', 'C', 'D']).map((o) => (
              <li key={o} className="flex flex-wrap items-center gap-2">
                <span className={answer?.selected_option === o ? 'text-label text-ink' : 'text-ink-secondary'}>{`${o}. ${q.options?.[o] ?? ''}`}</span>
                {answer?.selected_option === o ? <StatusChip tone={o === q.correct_option ? 'success' : 'error'}>Chosen</StatusChip> : null}
                {o === q.correct_option ? <StatusChip tone="success">Correct answer</StatusChip> : null}
              </li>
            ))}
          </ul>
          <CardDescription>{`Marked automatically: ${Number(answer?.score ?? 0)} of ${Number(q.marks)}${answer?.selected_option ? '' : ' (no choice made)'}.`}</CardDescription>
        </>
      ) : (
        <>
          {answer?.text_answer ? <p className="m-0 whitespace-pre-wrap break-words rounded-md bg-fill p-3 text-body text-ink">{answer.text_answer}</p> : null}
          {audios.map((audio, i) => (
            <AnswerAudio
              key={audio.file_id}
              bucket={audio.bucket}
              path={audio.storage_path}
              label={audios.length > 1 ? `Recorded answer ${i + 1} of ${audios.length} to question ${number}` : `Recorded answer to question ${number}`}
            />
          ))}
          {doc ? <ExamDocumentLink file={doc} /> : null}
          {!answer?.text_answer && !audios.length && !doc ? <CardDescription>No answer was given (marked 0).</CardDescription> : null}
          {q.marking_guide ? (
            <details className="text-body-sm">
              <summary className="flex min-h-11 cursor-pointer items-center text-label text-link focus-visible:focus-ring">Marking guide</summary>
              <p className="m-0 whitespace-pre-wrap text-ink-secondary">{q.marking_guide}</p>
            </details>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <FormField label={`Mark out of ${Number(q.marks)}`} name={`mark-${q.id}`} value={score} onChange={(e) => setScore(e.target.value)} inputMode="decimal" maxLength={7} />
            <div className="flex flex-col gap-1 sm:col-span-3">
              <Label htmlFor={`feedback-${q.id}`}>Feedback (optional)</Label>
              <Textarea id={`feedback-${q.id}`} value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} maxLength={10000} />
            </div>
          </div>
          <FormMessage>{message}</FormMessage>
          <Button className="self-start" variant="outline" onClick={() => void save()} loading={busy} loadingLabel="Saving">
            Save mark
          </Button>
        </>
      )}
    </Card>
  );
}

/** A recorded answer, played from a short-lived link (Storage policy: the learner and the course's managers). @param {{ bucket: string, path: string, label: string }} props */
function AnswerAudio({ bucket, path, label }) {
  const [src, setSrc] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    let live = true;
    audioUrl(bucket, path)
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [bucket, path]);
  return src ? <audio controls preload="metadata" src={src} aria-label={label} className="w-full" /> : <p className="m-0 text-body-sm text-ink-secondary">Loading the recording…</p>;
}

/** @param {{ examId: string, learnerId: string, initial: string, reason: string, releasable: boolean, onSaved: () => void }} props */
function OverallCard({ examId, learnerId, initial, reason, releasable, onSaved }) {
  const toast = useToast();
  const [feedback, setFeedback] = useState(initial);
  const [busy, setBusy] = useState(/** @type {'feedback' | 'release' | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  /** @param {'feedback' | 'release'} key @param {() => Promise<unknown>} run @param {() => void} after */
  const act = async (key, run, after) => {
    setBusy(key);
    setMessage(null);
    try {
      await run();
      after();
      onSaved();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-3" aria-labelledby="overall-title">
      <CardTitle id="overall-title">Overall feedback</CardTitle>
      <Textarea aria-labelledby="overall-title" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} maxLength={10000} />
      <FormMessage>{message}</FormMessage>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            void act(
              'feedback',
              () => saveExamFeedback({ examId, learnerId, feedback: feedback.trim(), ...(reason.trim() ? { reason: reason.trim() } : {}) }),
              () => toast.show('lecturer.grade-draft-saved'),
            )
          }
          loading={busy === 'feedback'}
          loadingLabel="Saving"
        >
          Save feedback
        </Button>
        <Button
          onClick={() => void act('release', () => releaseExam(examId, learnerId), () => toast.show('lecturer.grades-released', { params: { n: '1' } }))}
          loading={busy === 'release'}
          loadingLabel="Releasing"
          disabled={!releasable}
        >
          <Send aria-hidden="true" />
          Release result
        </Button>
      </div>
    </Card>
  );
}

/** @param {{ examId: string, learnerId: string, name: string, closesAt: string, onClose: () => void, onDone: () => void }} props */
function RetakeDialog({ examId, learnerId, name, closesAt, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState(() => toGhanaInput(new Date(Math.max(Date.parse(closesAt), Date.now()) + 7 * 86_400_000).toISOString()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  const run = async () => {
    if (!reason.trim()) return setMessage('Give a reason for the retake');
    const at = fromGhanaInput(until);
    if (!at || Date.parse(at) <= Date.now()) return setMessage('Give a deadline in the future');
    setBusy(true);
    setMessage(null);
    try {
      await authoriseRetake(examId, learnerId, reason.trim());
      await setExamExtension(examId, learnerId, at, `Retake: ${reason.trim()}`);
      toast.show('lecturer.retake-authorised');
      onClose();
      onDone();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Authorise a retake for ${name}`}</DialogTitle>
          <DialogDescription>Their earlier attempt is kept. The retake counts once its result is released.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="retake-reason">Reason</Label>
          <Textarea id="retake-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} />
        </div>
        <FormField label="Their new deadline" name="retakeUntil" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} hint="Ghana time (GMT)." />
        <FormMessage>{message}</FormMessage>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void run()} loading={busy} loadingLabel="Authorising">
            Authorise retake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
