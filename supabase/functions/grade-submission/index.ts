// grade-submission (Phase 9; D14, D16, D30; owner decisions 2, 3, 6 and 7): the course's lecturers and
// AAL2 administrators save a grade for a sent answer (a score from 0 to the maximum marks with up to
// two decimals, and plain-text feedback up to 10,000 characters), change a released grade with a reason
// (the change waits to be released), and reopen a graded answer with a reason. The database functions
// re-check the actor and the course, keep the score in range, record the history and audit. Since
// Phase 10.1 (ADR-016) also the practical mark sheet: many learners' marks at once.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const codePoints = (s: string) => [...s].length;

const Score = z
  .number({ error: 'Enter a score' })
  .min(0, 'Enter a score of 0 or more')
  .max(10000, 'Enter a score of at most 10,000')
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'Use at most two decimals');

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    assignmentId: z.uuid(),
    learnerId: z.uuid(),
    score: Score,
    feedback: z
      .string()
      .default('')
      .refine((s) => codePoints(s) <= 10000, 'Keep the feedback to 10,000 characters'),
    reason: z.string().trim().max(1000, 'Keep the reason to 1,000 characters').optional(),
  }),
  // Phase 10.1 (ADR-016; owner request 2026-11-10): the practical mark sheet, many learners at once; an
  // empty score is skipped. The database checks the practical, the course, each learner and each score.
  z.object({
    action: z.literal('save-practical-marks'),
    assignmentId: z.uuid(),
    marks: z
      .array(
        z.object({
          learnerId: z.uuid(),
          score: Score.nullable(),
          feedback: z
            .string()
            .default('')
            .refine((s) => codePoints(s) <= 10000, 'Keep the feedback to 10,000 characters'),
        }),
      )
      .min(1, 'Enter at least one mark')
      .max(1000, 'Send at most 1,000 marks at once'),
    reason: z.string().trim().max(1000, 'Keep the reason to 1,000 characters').optional(),
  }),
  z.object({
    action: z.literal('reopen'),
    assignmentId: z.uuid(),
    learnerId: z.uuid(),
    reason: z.string().trim().min(1, 'Give a reason for reopening').max(1000, 'Keep the reason to 1,000 characters'),
  }),
]);

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();
  const actor = { p_actor: caller.id, p_as_admin: caller.isAdmin };

  if (b.action === 'save') {
    const { data, error } = await admin.rpc('grade_save', {
      ...actor,
      p_assignment: b.assignmentId,
      p_learner: b.learnerId,
      p_score: b.score,
      p_feedback: b.feedback,
      p_reason: b.reason ?? null,
    });
    if (error) throw fromDbError(error);
    const row = Array.isArray(data) ? data[0] : data;
    return json(req, 200, { submissionId: row.submission_id, changed: row.changed, gradeReleaseStatus: row.grade_release_status });
  }

  if (b.action === 'save-practical-marks') {
    const { data, error } = await admin.rpc('practical_marks_save', {
      ...actor,
      p_assignment: b.assignmentId,
      p_marks: b.marks.map((m) => ({ learner_id: m.learnerId, score: m.score, feedback: m.feedback })),
      p_reason: b.reason ?? null,
    });
    if (error) throw fromDbError(error);
    return json(req, 200, { saved: data as number });
  }

  const { error } = await admin.rpc('grade_reopen', { ...actor, p_assignment: b.assignmentId, p_learner: b.learnerId, p_reason: b.reason });
  if (error) throw fromDbError(error);
  return json(req, 200, { reopened: true });
});
