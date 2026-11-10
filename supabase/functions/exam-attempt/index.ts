// exam-attempt (Phase 10.1; ADR-016; owner request and answers of 2026-11-10): a learner starts an
// examination once it is open, saves answers as they go (autosave: A to D for multiple choice, text and
// a recording for short answers and essays), and submits it once. There is no countdown: the only limit
// is the learner's deadline, which the database enforces in its own time, as it does enrolment, the
// opening time and "submitted once". Multiple choice is marked when the examination is submitted.
import { z } from 'npm:zod@4.6.7';
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const codePoints = (s: string) => [...s].length;

const Answer = z.object({
  questionId: z.uuid(),
  selectedOption: z.enum(['A', 'B', 'C', 'D'], { error: 'Choose A, B, C or D' }).nullable().optional(),
  textAnswer: z
    .string()
    .refine((s) => codePoints(s) <= 50000, 'Keep each answer to 50,000 characters')
    .optional(),
  // A recording made for this examination (register-upload, finalize-upload), or null to remove it.
  audioFileId: z.uuid().nullable().optional(),
});

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), examId: z.uuid() }),
  z.object({ action: z.literal('save'), examId: z.uuid(), answers: z.array(Answer).min(1).max(200) }),
  z.object({ action: z.literal('submit'), examId: z.uuid() }),
]);

serve(async (req) => {
  const caller = await requireUser(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();

  if (b.action === 'start') {
    const { data, error } = await admin.rpc('exam_start', { p_actor: caller.id, p_exam: b.examId });
    if (error) throw fromDbError(error);
    return json(req, 200, { attemptId: data as string });
  }
  if (b.action === 'save') {
    const answers = b.answers.map((a) => ({
      question_id: a.questionId,
      ...(a.selectedOption !== undefined ? { selected_option: a.selectedOption } : {}),
      ...(a.textAnswer !== undefined ? { text_answer: a.textAnswer } : {}),
      ...(a.audioFileId !== undefined ? { audio_file_id: a.audioFileId } : {}),
    }));
    const { data, error } = await admin.rpc('exam_save_answers', { p_actor: caller.id, p_exam: b.examId, p_answers: answers });
    if (error) throw fromDbError(error);
    return json(req, 200, { savedAt: data as string });
  }
  const { data, error } = await admin.rpc('exam_submit', { p_actor: caller.id, p_exam: b.examId });
  if (error) throw fromDbError(error);
  const row = (Array.isArray(data) ? data[0] : data) as { attempt_id: string; submitted_at: string };
  return json(req, 200, { attemptId: row.attempt_id, submittedAt: row.submitted_at });
});
