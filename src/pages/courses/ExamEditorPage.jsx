import { ArrowLeft, Eye, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { FormSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue, fromGhanaInput, toGhanaInput } from '@/lib/assignments/due.js';
import { useClientSettings } from '@/lib/settings/client-settings.js';
import {
  archiveExam,
  blankQuestion,
  closeExam,
  editorTotal,
  examStatus,
  fetchExamForEditing,
  publishExam,
  saveExam,
  saveExamStructure,
  setExamDeadline,
} from '@/lib/exams/exams.js';

// The examination editor for the course's lecturers and administrators (Phase 10.1, ADR-016; owner
// request and answers of 2026-11-10): the details (title, description, instructions, pass mark, opening
// and closing time in Ghana time), the sections and questions (multiple choice with four options A to D
// and the correct one, short answer with a marking guide, essay), each with its marks and the total
// added up, Preview as a learner sees it, Publish or Unpublish, Archive. Once a learner has started, the
// details and questions are locked; the deadline can still move, or the examination close early. There is
// no time limit: the deadline is the only limit.

/** @typedef {import('@/lib/exams/exams.js').EditorSection} Section */
/** @typedef {import('@/lib/exams/exams.js').EditorQuestion} Question */

const KIND_LABEL = /** @type {const} */ ({ MCQ: 'Multiple choice', SHORT: 'Short answer', ESSAY: 'Essay' });
const OPTIONS = /** @type {const} */ (['A', 'B', 'C', 'D']);

/** A default opening or closing time for a new examination (only read when the form first appears). @param {number} days */
function daysFromNow(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function ExamEditorPage({ role }) {
  const { courseId = '', examId = '' } = useParams();
  const creating = examId === 'new';
  const page = useLoad(() => (creating ? Promise.resolve(null) : fetchExamForEditing(examId)), [examId]);
  const back = `/${role}/courses/${courseId}/examinations`;

  if (page.state === 'error') return <ErrorState title="The examination could not be loaded" onRetry={page.reload} />;
  if (page.state === 'ready' && !creating && !page.data?.exam) {
    return <EmptyState title="Examination not found" description="It may not exist, or you do not teach this course." />;
  }
  const exam = page.data?.exam ?? null;
  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<FormSkeleton fields={6} />} onRetry={page.reload}>
      {page.state === 'ready' ? (
        <div className="flex flex-col gap-6">
          <Link to={back} className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Examinations
          </Link>
          <PageHeader
            title={exam ? exam.title : 'New examination'}
            description={exam ? `${examStatus(exam).label}. Opens ${formatDue(exam.opens_at)}, closes ${formatDue(exam.closed_at ?? exam.closes_at)} (Ghana time).` : 'Set the details first, then the questions.'}
            className="pb-0"
          />
          <DetailsCard role={role} courseId={courseId} exam={exam} locked={Boolean(page.data?.started)} onSaved={page.reload} />
          {exam ? (
            <>
              <QuestionsCard examId={exam.id} initial={page.data?.sections ?? []} locked={Boolean(page.data?.started)} onSaved={page.reload} />
              <PublishCard exam={exam} started={Boolean(page.data?.started)} sections={page.data?.sections ?? []} onChanged={page.reload} />
            </>
          ) : null}
        </div>
      ) : null}
    </LoadingRegion>
  );
}

/**
 * @param {{ role: 'admin' | 'lecturer', courseId: string, exam: import('@/lib/exams/exams.js').ExamRow | null, locked: boolean, onSaved: () => void }} props
 */
function DetailsCard({ role, courseId, exam, locked, onSaved }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState(exam?.title ?? '');
  const [description, setDescription] = useState(exam?.description ?? '');
  const [instructions, setInstructions] = useState(exam?.instructions ?? '');
  // A new examination starts from the pass mark in Settings; each examination keeps its own.
  const defaultPass = useClientSettings()?.pass_mark ?? 50;
  const [passDraft, setPassMark] = useState(/** @type {string | null} */ (exam ? String(exam.pass_mark) : null));
  const passMark = passDraft ?? String(defaultPass);
  const [opens, setOpens] = useState(() => toGhanaInput(exam?.opens_at ?? daysFromNow(1)));
  const [closes, setCloses] = useState(() => toGhanaInput(exam?.closes_at ?? daysFromNow(8)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  const save = async () => {
    const pass = Number(passMark);
    if (title.trim().length < 3) return setMessage('Give the examination a title of 3 to 200 characters');
    if (!Number.isInteger(pass) || pass < 0 || pass > 100) return setMessage('The pass mark is a whole percentage from 0 to 100');
    const opensAt = fromGhanaInput(opens);
    const closesAt = fromGhanaInput(closes);
    if (!opensAt || !closesAt) return setMessage('Set the opening and closing time');
    if (Date.parse(closesAt) <= Date.parse(opensAt)) return setMessage('The closing time must be after the opening time');
    setBusy(true);
    setMessage(null);
    try {
      const res = await saveExam({
        courseId,
        examId: exam?.id,
        fields: { title: title.trim(), description, instructions, pass_mark: pass, opens_at: opensAt, closes_at: closesAt },
      });
      toast.show('lecturer.exam-saved');
      if (exam) onSaved();
      else navigate(`/${role}/courses/${courseId}/exams/${res.examId}`, { replace: true });
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4" aria-labelledby="exam-details-title">
      <CardTitle id="exam-details-title">Details</CardTitle>
      {locked ? <CardDescription>A learner has started this examination, so its details are locked. The deadline can still change below.</CardDescription> : null}
      <FormField label="Title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} maxLength={200} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="exam-description">Description (optional)</Label>
        <Textarea id="exam-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} maxLength={2000} rows={2} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="exam-instructions">Instructions for learners</Label>
        <Textarea id="exam-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} disabled={locked} maxLength={20000} rows={4} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Pass mark (%)" name="passMark" value={passMark} onChange={(e) => setPassMark(e.target.value)} disabled={locked} inputMode="numeric" maxLength={3} />
        <FormField label="Opens" name="opensAt" type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} disabled={locked} hint="Ghana time (GMT)." />
        <FormField label="Closes (deadline)" name="closesAt" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} disabled={locked} hint="Ghana time (GMT)." />
      </div>
      <FormMessage>{message}</FormMessage>
      {locked ? null : (
        <Button className="self-start" onClick={() => void save()} loading={busy} loadingLabel="Saving">
          {exam ? 'Save details' : 'Create examination'}
        </Button>
      )}
    </Card>
  );
}

/** @param {{ examId: string, initial: Section[], locked: boolean, onSaved: () => void }} props */
function QuestionsCard({ examId, initial, locked, onSaved }) {
  const toast = useToast();
  const [sections, setSections] = useState(() => /** @type {Section[]} */ (initial.length ? initial : [{ title: 'Section A', instructions: '', questions: [] }]));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  /** @param {number} si @param {(s: Section) => Section} f */
  const editSection = (si, f) => setSections((all) => all.map((s, i) => (i === si ? f(s) : s)));
  /** @param {number} si @param {number} qi @param {Partial<Question>} change */
  const editQuestion = (si, qi, change) => editSection(si, (s) => ({ ...s, questions: s.questions.map((q, j) => (j === qi ? { ...q, ...change } : q)) }));
  const total = editorTotal(sections);

  const save = async () => {
    for (const [si, s] of sections.entries()) {
      if (!s.title.trim()) return setMessage(`Give section ${si + 1} a title`);
      if (!s.questions.length) return setMessage(`Add at least one question to ${s.title}`);
      for (const [qi, q] of s.questions.entries()) {
        const where = `${s.title}, question ${qi + 1}`;
        if (!q.prompt.trim()) return setMessage(`${where}: give the question a prompt`);
        if (!(Number(q.marks) > 0)) return setMessage(`${where}: give the question marks above 0`);
        if (q.kind === 'MCQ' && OPTIONS.some((o) => !q.options[o].trim())) return setMessage(`${where}: give all four options, A to D`);
        if (q.kind === 'MCQ' && !q.correct) return setMessage(`${where}: choose the correct answer`);
      }
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveExamStructure(examId, sections);
      toast.show('lecturer.exam-saved');
      onSaved();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4" aria-labelledby="exam-questions-title" data-slot="exam-builder">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="exam-questions-title">Sections and questions</CardTitle>
        <StatusChip tone="info">{`Total ${total} marks`}</StatusChip>
      </div>
      {locked ? <CardDescription>A learner has started, so the questions are locked.</CardDescription> : null}
      {sections.map((s, si) => (
        <section key={si} className="flex flex-col gap-3 rounded-md border border-hairline p-3" aria-label={s.title || `Section ${si + 1}`}>
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Label htmlFor={`section-${si}-title`}>Section title</Label>
              <Input id={`section-${si}-title`} value={s.title} onChange={(e) => editSection(si, (x) => ({ ...x, title: e.target.value }))} disabled={locked} maxLength={200} />
            </div>
            {locked ? null : (
              <Button
                variant="ghost"
                size="icon"
                className="text-error"
                onClick={() => setSections((all) => all.filter((_, i) => i !== si))}
                disabled={sections.length === 1}
                aria-label={`Remove ${s.title || `section ${si + 1}`}`}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </div>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {s.questions.map((q, qi) => (
              <li key={qi} className="flex flex-col gap-3 rounded-md bg-fill p-3" data-slot="exam-question">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-label text-ink">
                    {`Question ${qi + 1} · ${KIND_LABEL[q.kind]}`}
                  </span>
                  {locked ? null : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-error"
                      onClick={() => editSection(si, (x) => ({ ...x, questions: x.questions.filter((_, j) => j !== qi) }))}
                      aria-label={`Remove question ${qi + 1} of ${s.title}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`q-${si}-${qi}-prompt`}>Question</Label>
                  <Textarea id={`q-${si}-${qi}-prompt`} value={q.prompt} onChange={(e) => editQuestion(si, qi, { prompt: e.target.value })} disabled={locked} rows={2} maxLength={10000} />
                </div>
                {q.kind === 'MCQ' ? (
                  <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                    <legend className="mb-1 text-label text-ink">Options (choose the correct one)</legend>
                    <RadioGroup value={q.correct} onValueChange={(v) => editQuestion(si, qi, { correct: /** @type {Question['correct']} */ (v) })} disabled={locked}>
                      {OPTIONS.map((o) => (
                        <div key={o} className="flex items-center gap-2">
                          <RadioGroupItem id={`q-${si}-${qi}-correct-${o}`} value={o} aria-label={`Option ${o} is correct`} />
                          <Label htmlFor={`q-${si}-${qi}-option-${o}`} className="w-6 shrink-0">
                            {o}
                          </Label>
                          <Input
                            id={`q-${si}-${qi}-option-${o}`}
                            value={q.options[o]}
                            onChange={(e) => editQuestion(si, qi, { options: { ...q.options, [o]: e.target.value } })}
                            disabled={locked}
                            maxLength={1000}
                          />
                        </div>
                      ))}
                    </RadioGroup>
                  </fieldset>
                ) : (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`q-${si}-${qi}-guide`}>Expected answer or marking guide (only lecturers see it)</Label>
                    <Textarea id={`q-${si}-${qi}-guide`} value={q.guide} onChange={(e) => editQuestion(si, qi, { guide: e.target.value })} disabled={locked} rows={2} maxLength={10000} />
                  </div>
                )}
                <div className="flex w-32 flex-col gap-1">
                  <Label htmlFor={`q-${si}-${qi}-marks`}>Marks</Label>
                  <Input id={`q-${si}-${qi}-marks`} value={q.marks} onChange={(e) => editQuestion(si, qi, { marks: e.target.value })} disabled={locked} inputMode="decimal" maxLength={7} />
                </div>
              </li>
            ))}
          </ol>
          {locked ? null : (
            <div className="flex flex-wrap gap-2">
              {/** @type {const} */ (['MCQ', 'SHORT', 'ESSAY']).map((k) => (
                <Button key={k} variant="outline" onClick={() => editSection(si, (x) => ({ ...x, questions: [...x.questions, blankQuestion(k)] }))}>
                  <Plus aria-hidden="true" />
                  {`Add ${KIND_LABEL[k].toLowerCase()}`}
                </Button>
              ))}
            </div>
          )}
        </section>
      ))}
      <FormMessage>{message}</FormMessage>
      {locked ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setSections((all) => [...all, { title: `Section ${String.fromCharCode(65 + all.length)}`, instructions: '', questions: [] }])}
            disabled={sections.length >= 20}
          >
            <Plus aria-hidden="true" />
            Add section
          </Button>
          <Button onClick={() => void save()} loading={busy} loadingLabel="Saving">
            Save questions
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * @param {{ exam: import('@/lib/exams/exams.js').ExamRow, started: boolean, sections: Section[], onChanged: () => void }} props
 */
function PublishCard({ exam, started, sections, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [previewing, setPreviewing] = useState(false);
  const [deadline, setDeadline] = useState(toGhanaInput(exam.closes_at));
  const [reason, setReason] = useState('');
  const published = exam.publication_status === 'PUBLISHED';

  /** @param {string} key @param {() => Promise<unknown>} run @param {Parameters<ReturnType<typeof useToast>['show']>[0]} toastId */
  const act = async (key, run, toastId) => {
    setBusy(key);
    setMessage(null);
    try {
      await run();
      toast.show(toastId);
      onChanged();
    } catch (e) {
      setMessage(/** @type {Error} */ (e).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4" aria-labelledby="exam-publish-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="exam-publish-title">Publishing and deadline</CardTitle>
        <StatusChip tone={examStatus(exam).tone}>{examStatus(exam).label}</StatusChip>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setPreviewing(true)}>
          <Eye aria-hidden="true" />
          Preview
        </Button>
        {exam.archived_at ? null : published ? (
          started ? null : (
            <Button variant="outline" onClick={() => void act('unpublish', () => publishExam(exam.id, false), 'lecturer.exam-unpublished')} loading={busy === 'unpublish'} loadingLabel="Working">
              Unpublish
            </Button>
          )
        ) : (
          <Button onClick={() => void act('publish', () => publishExam(exam.id, true), 'lecturer.exam-published')} loading={busy === 'publish'} loadingLabel="Publishing">
            Publish
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => void act('archive', () => archiveExam(exam.id, !exam.archived_at), exam.archived_at ? 'lecturer.exam-saved' : 'lecturer.exam-archived')}
          loading={busy === 'archive'}
          loadingLabel="Working"
        >
          {exam.archived_at ? 'Restore' : 'Archive'}
        </Button>
      </div>
      {published && !exam.archived_at ? (
        <div className="flex flex-col gap-3 rounded-md bg-fill p-3">
          <p className="m-0 text-body-sm text-ink">
            {exam.closed_at ? `Closed early on ${formatDue(exam.closed_at)}. Set a new deadline to reopen it.` : `Learners must submit by ${formatDue(exam.closes_at)} (Ghana time).`}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="New deadline" name="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} hint="Ghana time (GMT)." />
            <div className="flex flex-col gap-1">
              <Label htmlFor="deadline-reason">Reason (optional)</Label>
              <Input id="deadline-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const at = fromGhanaInput(deadline);
                if (!at) return setMessage('Set the new deadline');
                void act('deadline', () => setExamDeadline(exam.id, at, reason.trim() || undefined), 'lecturer.exam-deadline-changed');
              }}
              loading={busy === 'deadline'}
              loadingLabel="Saving"
            >
              Change deadline
            </Button>
            {exam.closed_at ? null : (
              <Button variant="outline" onClick={() => void act('close', () => closeExam(exam.id, reason.trim() || undefined), 'lecturer.exam-closed')} loading={busy === 'close'} loadingLabel="Closing">
                Close now
              </Button>
            )}
          </div>
        </div>
      ) : null}
      <FormMessage>{message}</FormMessage>
      {previewing ? <PreviewDialog exam={exam} sections={sections} onClose={() => setPreviewing(false)} /> : null}
    </Card>
  );
}

/** What learners will see (without the correct answers and guides). @param {{ exam: import('@/lib/exams/exams.js').ExamRow, sections: Section[], onClose: () => void }} props */
function PreviewDialog({ exam, sections, onClose }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Preview: ${exam.title}`}</DialogTitle>
          <DialogDescription>{`What learners see. ${editorTotal(sections)} marks; pass mark ${exam.pass_mark}%. Correct answers and marking guides are hidden from them.`}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-96 flex-col gap-4 overflow-y-auto focus-visible:focus-ring" tabIndex={0} role="region" aria-label="Examination preview">
          {exam.instructions ? <p className="m-0 whitespace-pre-wrap text-body-sm text-ink">{exam.instructions}</p> : null}
          {sections.map((s, si) => (
            <section key={si} className="flex flex-col gap-2">
              <h3 className="m-0 text-headline text-ink">{s.title}</h3>
              <ol className="m-0 flex flex-col gap-3 pl-5">
                {s.questions.map((q, qi) => (
                  <li key={qi} className="text-body text-ink">
                    <span className="whitespace-pre-wrap">{q.prompt}</span> <span className="text-ink-secondary">({`${Number(q.marks)} marks`})</span>
                    {q.kind === 'MCQ' ? (
                      <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-body-sm">
                        {OPTIONS.map((o) => (
                          <li key={o}>{`${o}. ${q.options[o]}`}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="block text-body-sm text-ink-secondary">{q.kind === 'ESSAY' ? 'A long written or recorded answer.' : 'A short written or recorded answer.'}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
