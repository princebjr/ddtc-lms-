// grade-examination (Phase 10.1; ADR-016; owner request and answers of 2026-11-10): the course's
// lecturers and AAL2 administrators mark short answers and essays question by question (0 to the
// question's marks; multiple choice is marked automatically and is final), give overall feedback,
// release the fully marked results (one learner or all), and authorise a retake with a reason. A
// released result changes only with a reason. The database functions check, record and audit each step.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const codePoints = (s: string) => [...s].length;
const Feedback = z
  .string()
  .default('')
  .refine((s) => codePoints(s) <= 10000, 'Keep the feedback to 10,000 characters');
const Reason = z.string().trim().max(1000, 'Keep the reason to 1,000 characters');
const Score = z
  .number({ error: 'Enter a score' })
  .min(0, 'Enter a score of 0 or more')
  .max(1000, 'Enter a score of at most 1,000')
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'Use at most two decimals');

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark'),
    examId: z.uuid(),
    learnerId: z.uuid(),
    questionId: z.uuid(),
    score: Score,
    feedback: Feedback,
    reason: Reason.optional(),
  }),
  z.object({ action: z.literal('feedback'), examId: z.uuid(), learnerId: z.uuid(), feedback: Feedback, reason: Reason.optional() }),
  z.object({ action: z.literal('release'), examId: z.uuid(), learnerId: z.uuid().optional() }),
  z.object({
    action: z.literal('retake'),
    examId: z.uuid(),
    learnerId: z.uuid(),
    reason: Reason.min(1, 'Give a reason for the retake'),
  }),
]);

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();
  const actor = { p_actor: caller.id, p_as_admin: caller.isAdmin };

  switch (b.action) {
    case 'mark': {
      const { error } = await admin.rpc('exam_answer_grade', {
        ...actor,
        p_exam: b.examId,
        p_learner: b.learnerId,
        p_question: b.questionId,
        p_score: b.score,
        p_feedback: b.feedback,
        p_reason: b.reason ?? null,
      });
      if (error) throw fromDbError(error);
      return json(req, 200, { marked: true });
    }
    case 'feedback': {
      const { error } = await admin.rpc('exam_feedback_save', {
        ...actor,
        p_exam: b.examId,
        p_learner: b.learnerId,
        p_feedback: b.feedback,
        p_reason: b.reason ?? null,
      });
      if (error) throw fromDbError(error);
      return json(req, 200, { saved: true });
    }
    case 'release': {
      const { data, error } = await admin.rpc('exam_release', { ...actor, p_exam: b.examId, p_learner: b.learnerId ?? null });
      if (error) throw fromDbError(error);
      return json(req, 200, { released: data as number });
    }
    case 'retake': {
      const { data, error } = await admin.rpc('exam_retake_authorise', { ...actor, p_exam: b.examId, p_learner: b.learnerId, p_reason: b.reason });
      if (error) throw fromDbError(error);
      return json(req, 200, { attemptId: data as string });
    }
  }
});
