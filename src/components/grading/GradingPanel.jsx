import { RotateCcw, Save, Send } from 'lucide-react';
import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { ReopenDialog } from '@/components/grading/ReopenDialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Label } from '@/components/ui/label.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { FunctionError } from '@/lib/functions.js';
import { formatPercentage, formatScore, gradeState, isSet, MAX_FEEDBACK, releaseGrades, saveGrade } from '@/lib/grading/grading.js';
import { cn } from '@/lib/utils.js';

// The grading panel (Phase 9; DESIGN.md 13 grading screen; D14, D16, D30; owner decisions 2, 3, 6, 7):
// marks out of the assignment's maximum (up to two decimals) and plain-text feedback, Save draft and
// Release grade in a bar that sticks above the phone navigation (two panes from tablet width, where
// the panel itself stays in view). Percentage, letter grade and band are shown as the database
// computed them after saving (D30: no grade formulas here). A released grade changes only with a
// reason, and the learner keeps seeing the released one until the change is released; Reopen grade
// takes a reason too.

/** @typedef {import('@/lib/submissions/submissions.js').SubmissionReview} Review */

/**
 * @param {{
 *   assignmentId: string,
 *   learnerId: string,
 *   learnerName: string,
 *   review: Review & { max_marks: number, grade: GradeInfo | null },
 *   readOnly: boolean,
 *   onChanged: () => void,
 * }} props
 */
export function GradingPanel({ assignmentId, learnerId, learnerName, review, readOnly, onChanged }) {
  const toast = useToast();
  const grade = review.grade;
  const max = Number(review.max_marks);
  const [score, setScore] = useState(isSet(grade?.score) ? String(Number(grade.score)) : '');
  const [feedback, setFeedback] = useState(grade?.feedback ?? '');
  const [reason, setReason] = useState('');
  const [scoreError, setScoreError] = useState(/** @type {string | null} */ (null));
  const [reasonError, setReasonError] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(/** @type {null | 'save' | 'release'} */ (null));
  const [reopening, setReopening] = useState(false);

  const sent = isSet(review.status);
  const released = Boolean(grade?.released_at);
  const trimmed = feedback.trim();
  const savedScore = isSet(grade?.score) ? Number(grade.score) : null;
  const typed = score.trim() === '' ? null : Number(score);
  // Whether the form differs from what is saved, and from what the learner sees (labels only).
  const dirty = typed !== savedScore || trimmed !== (grade?.feedback ?? '');
  const changesRelease = released && (typed !== Number(grade?.released_score) || trimmed !== (grade?.released_feedback ?? ''));
  const state = gradeState({
    status: review.status,
    score: savedScore,
    grade_release_status: grade?.grade_release_status ?? null,
    released_at: grade?.released_at ?? null,
    changed_since_release: Boolean(grade?.changed_since_release),
  });
  const canRelease = review.status === 'GRADED' && grade?.grade_release_status === 'DRAFT' && isSet(savedScore);

  /** Checks the form before sending; the server checks again. @returns {number | null} */
  const validScore = () => {
    if (!isSet(typed) || Number.isNaN(typed)) {
      setScoreError(`Enter a score from 0 to ${max}`);
      return null;
    }
    if (typed < 0 || typed > max) {
      setScoreError(`Enter a score from 0 to ${max}`);
      return null;
    }
    if (Math.abs(Math.round(typed * 100) - typed * 100) > 1e-6) {
      setScoreError('Use at most two decimals');
      return null;
    }
    setScoreError(null);
    return typed;
  };

  /** Saves the form if it changed. @returns {Promise<boolean>} whether everything is saved */
  const saveIfNeeded = async () => {
    const value = validScore();
    if (!isSet(value)) return false;
    if (changesRelease && !reason.trim()) {
      setReasonError('Give a reason for changing a released grade');
      return false;
    }
    setReasonError(null);
    if (!dirty && review.status === 'GRADED') return true;
    await saveGrade({ assignmentId, learnerId, score: value, feedback: trimmed, reason: changesRelease ? reason.trim() : undefined });
    return true;
  };

  /** @param {unknown} e */
  const failed = (e) => {
    const text = e instanceof Error ? e.message : 'Something went wrong. Try again.';
    if (e instanceof FunctionError && /^The score must be between/.test(text)) {
      setScoreError(text);
      toast.show('lecturer.score-out-of-range');
      return;
    }
    setMessage(text);
  };

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSave = async (event) => {
    event.preventDefault();
    setMessage(null);
    setBusy('save');
    try {
      if (await saveIfNeeded()) {
        toast.show('lecturer.grade-draft-saved');
        setReason('');
        onChanged();
      }
    } catch (e) {
      failed(e);
    } finally {
      setBusy(null);
    }
  };

  const onRelease = async () => {
    setMessage(null);
    setBusy('release');
    try {
      if (!(await saveIfNeeded())) return;
      const { released: n } = await releaseGrades({ assignmentId, learnerId });
      toast.show('lecturer.grades-released', { params: { n: String(n) } });
      setReason('');
      onChanged();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(null);
    }
  };

  if (!sent) {
    return (
      <section aria-labelledby="grading-title" className="flex flex-col gap-2 rounded-lg border border-hairline bg-card p-4">
        <h2 id="grading-title" className="m-0 text-headline text-ink">
          Grade
        </h2>
        <p className="m-0 text-body text-ink-secondary">There is nothing to grade until {learnerName} sends an answer.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="grading-title" data-slot="grading-panel" className="flex flex-col gap-4 rounded-lg border border-hairline bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="grading-title" className="m-0 text-headline text-ink">
          Grade
        </h2>
        <StatusChip tone={state.tone}>{state.label}</StatusChip>
      </div>

      {isSet(grade?.score) ? (
        <p className="m-0 text-body-sm text-ink-secondary" data-testid="grade-facts">
          Saved: <span className="tabular-nums text-ink">{formatScore(grade.score, max)}</span>
          {isSet(grade.percentage) ? (
            <>
              {' · '}
              <span className="tabular-nums">{formatPercentage(grade.percentage)}</span>
              {grade.letter_grade ? ` · ${grade.letter_grade}` : ''}
              {grade.band ? ` · band ${grade.band}` : ''}
            </>
          ) : null}
        </p>
      ) : null}
      {released ? (
        <p className="m-0 rounded-md bg-fill p-3 text-body-sm text-ink">
          The learner sees <span className="tabular-nums">{formatScore(grade?.released_score, max)}</span>
          {grade?.changed_since_release ? '. Your change is saved but not released yet.' : '.'}
        </p>
      ) : null}

      <form noValidate onSubmit={onSave} className="flex flex-col gap-4">
        <FormField
          label="Marks"
          name="score"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={score}
          onChange={(e) => setScore(e.target.value.replace(',', '.'))}
          error={scoreError ?? undefined}
          hint={`Out of ${max}. Up to two decimals.`}
          disabled={readOnly || busy !== null}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="grade-feedback">Feedback (optional)</Label>
          <Textarea
            id="grade-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={MAX_FEEDBACK}
            rows={6}
            className="min-h-36"
            aria-describedby="grade-feedback-count"
            disabled={readOnly || busy !== null}
          />
          <span id="grade-feedback-count" className="text-caption text-ink-secondary tabular-nums">
            {[...feedback].length.toLocaleString('en-GB')} of {MAX_FEEDBACK.toLocaleString('en-GB')} characters
          </span>
        </div>
        {changesRelease ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="grade-reason">Reason for the change</Label>
            <Textarea
              id="grade-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={2}
              className="min-h-20"
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? 'grade-reason-error' : 'grade-reason-hint'}
              disabled={readOnly || busy !== null}
            />
            {reasonError ? (
              <p id="grade-reason-error" className="m-0 text-body-sm text-error">
                {reasonError}
              </p>
            ) : (
              <p id="grade-reason-hint" className="m-0 text-caption text-ink-secondary">
                Kept in the grade history. The learner is told when you release the change.
              </p>
            )}
          </div>
        ) : null}
        <FormMessage>{message}</FormMessage>
        {readOnly ? (
          <p className="m-0 text-body-sm text-ink-secondary">This course is archived, so grades can no longer change.</p>
        ) : (
          <div
            className={cn(
              'z-20 flex flex-col gap-2 rounded-lg border border-hairline bg-pill p-3 blur-material sm:flex-row sm:justify-end',
              'max-md:sticky max-md:bottom-above-nav',
            )}
          >
            <Button type="submit" variant="outline" loading={busy === 'save'} loadingLabel="Saving" disabled={busy !== null}>
              <Save aria-hidden="true" />
              Save draft
            </Button>
            <Button type="button" onClick={() => void onRelease()} loading={busy === 'release'} loadingLabel="Releasing" disabled={busy !== null || (!canRelease && !dirty)}>
              <Send aria-hidden="true" />
              Release grade
            </Button>
          </div>
        )}
      </form>

      {!readOnly && review.status === 'GRADED' ? (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setReopening(true)}>
          <RotateCcw aria-hidden="true" />
          Reopen grade
        </Button>
      ) : null}
      {reopening ? (
        <ReopenDialog
          assignmentId={assignmentId}
          learnerId={learnerId}
          learnerName={learnerName}
          onClose={() => setReopening(false)}
          onReopened={onChanged}
        />
      ) : null}
    </section>
  );
}

/**
 * @typedef {object} GradeInfo
 * @property {number | null} score
 * @property {string | null} feedback
 * @property {number | null} percentage
 * @property {string | null} letter_grade
 * @property {string | null} band
 * @property {'DRAFT' | 'RELEASED'} grade_release_status
 * @property {string | null} graded_at
 * @property {string | null} graded_by_name
 * @property {string | null} released_at
 * @property {number | null} released_score
 * @property {string | null} released_feedback
 * @property {boolean} changed_since_release
 */
