// manage-examinations (Phase 10.1; ADR-016; owner request and answers of 2026-11-10): the course's
// lecturers and AAL2 administrators set an examination (details, sections and questions), publish or
// unpublish it, archive or restore it, change its deadline for everyone, close it early, and give one
// learner more time. The database functions re-check the actor and the course, refuse changes to
// questions once a learner has started, and audit every step.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const When = z.iso.datetime({ offset: true, error: 'Give a date and time' });
const Reason = z.string().trim().max(1000, 'Keep the reason to 1,000 characters');

const Question = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('MCQ'),
    prompt: z.string().trim().min(1, 'Give each question a prompt').max(10000),
    marks: z.number().positive('Give each question marks above 0').max(1000),
    options: z.object({ A: z.string().max(1000), B: z.string().max(1000), C: z.string().max(1000), D: z.string().max(1000) }),
    correct: z.enum(['A', 'B', 'C', 'D'], { error: 'Choose the correct answer for each multiple-choice question' }),
  }),
  z.object({
    kind: z.enum(['SHORT', 'ESSAY']),
    prompt: z.string().trim().min(1, 'Give each question a prompt').max(10000),
    marks: z.number().positive('Give each question marks above 0').max(1000),
    guide: z.string().max(10000).default(''),
  }),
]);

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    courseId: z.uuid(),
    examId: z.uuid().optional(),
    fields: z.object({
      title: z.string().trim().min(3, 'Give the examination a title of 3 to 200 characters').max(200, 'Give the examination a title of 3 to 200 characters'),
      description: z.string().max(2000).default(''),
      instructions: z.string().max(20000).default(''),
      pass_mark: z.number().int('The pass mark is a whole percentage from 0 to 100').min(0).max(100),
      opens_at: When,
      closes_at: When,
    }),
  }),
  z.object({
    action: z.literal('structure'),
    examId: z.uuid(),
    sections: z
      .array(
        z.object({
          title: z.string().trim().min(1, 'Give each section a title').max(200),
          instructions: z.string().max(2000).default(''),
          questions: z.array(Question).min(1, 'Give each section at least one question').max(200),
        }),
      )
      .min(1, 'Give the examination at least one section')
      .max(20),
  }),
  z.object({ action: z.literal('publish'), examId: z.uuid(), publish: z.boolean() }),
  z.object({ action: z.literal('archive'), examId: z.uuid(), archived: z.boolean() }),
  z.object({ action: z.literal('deadline'), examId: z.uuid(), closesAt: When, reason: Reason.optional() }),
  z.object({ action: z.literal('close'), examId: z.uuid(), reason: Reason.optional() }),
  z.object({ action: z.literal('extension-set'), examId: z.uuid(), learnerId: z.uuid(), closesAt: When, reason: Reason.optional() }),
  z.object({ action: z.literal('extension-remove'), examId: z.uuid(), learnerId: z.uuid() }),
]);

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();
  const actor = { p_actor: caller.id, p_as_admin: caller.isAdmin };

  switch (b.action) {
    case 'save': {
      const { data, error } = await admin.rpc('exam_save', { ...actor, p_course: b.courseId, p_exam: b.examId ?? null, p_fields: b.fields });
      if (error) throw fromDbError(error);
      return json(req, 200, { examId: data as string });
    }
    case 'structure': {
      const { data, error } = await admin.rpc('exam_structure_save', { ...actor, p_exam: b.examId, p_sections: b.sections });
      if (error) throw fromDbError(error);
      return json(req, 200, { questions: data as number });
    }
    case 'publish': {
      const { error } = await admin.rpc('exam_publish', { ...actor, p_exam: b.examId, p_publish: b.publish });
      if (error) throw fromDbError(error);
      return json(req, 200, { published: b.publish });
    }
    case 'archive': {
      const { error } = await admin.rpc('exam_set_archived', { ...actor, p_exam: b.examId, p_archived: b.archived });
      if (error) throw fromDbError(error);
      return json(req, 200, { archived: b.archived });
    }
    case 'deadline': {
      const { error } = await admin.rpc('exam_set_deadline', { ...actor, p_exam: b.examId, p_closes_at: b.closesAt, p_reason: b.reason ?? null });
      if (error) throw fromDbError(error);
      return json(req, 200, { closesAt: b.closesAt });
    }
    case 'close': {
      const { error } = await admin.rpc('exam_close', { ...actor, p_exam: b.examId, p_reason: b.reason ?? null });
      if (error) throw fromDbError(error);
      return json(req, 200, { closed: true });
    }
    case 'extension-set': {
      const { error } = await admin.rpc('exam_extension_set', {
        ...actor,
        p_exam: b.examId,
        p_learner: b.learnerId,
        p_closes_at: b.closesAt,
        p_reason: b.reason ?? null,
      });
      if (error) throw fromDbError(error);
      return json(req, 200, { closesAt: b.closesAt });
    }
    case 'extension-remove': {
      const { error } = await admin.rpc('exam_extension_remove', { ...actor, p_exam: b.examId, p_learner: b.learnerId });
      if (error) throw fromDbError(error);
      return json(req, 200, { removed: true });
    }
  }
});
