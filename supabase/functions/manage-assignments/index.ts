// manage-assignments (Phase 7; D12, D29, ADR-009): course lecturers and administrators save
// assignments (instructions cleaned against the lesson allow-list first), publish and unpublish them,
// archive and restore them, and save the course's grade categories. The database functions re-check
// the actor and the course (archived courses are read-only), enforce the instruction types and the
// answer formats, keep snapshots of published assignments and audit every change.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

// The HTML cleaner (sanitize-html) is heavy to start, so it is loaded only by the actions that clean
// HTML; the others start quickly.
const htmlCleaner = () => import('../_shared/lesson-html.ts');

const Fields = z.object({
  title: z.string().trim().min(3, 'Enter a title of at least 3 characters').max(200, 'Use 200 characters or fewer'),
  description: z.string().max(2000, 'Keep the description to 2000 characters').default(''),
  lessonId: z.uuid().nullable().default(null),
  categoryId: z.uuid({ error: 'Choose a category' }),
  contentType: z.enum(['TEXT', 'AUDIO', 'TEXT_AND_AUDIO'], { error: 'Choose how the instructions are given' }),
  textInstructions: z.string().max(400000, 'The instructions are too long').default(''),
  dueAt: z.iso.datetime({ offset: true, error: 'Choose a due date and time' }),
  allowLate: z.boolean().default(false),
  maxMarks: z.number().positive('Maximum marks must be more than 0').max(10000, 'Maximum marks must be at most 10000'),
  acceptedFormats: z.array(z.enum(['TEXT', 'AUDIO', 'PDF', 'DOCX'])).max(4).default(['TEXT', 'AUDIO']),
  gradingCriteria: z.string().max(5000, 'Keep the grading criteria to 5000 characters').default(''),
});

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    courseId: z.uuid(),
    assignmentId: z.uuid().optional(),
    fields: Fields,
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({ action: z.literal('publish'), assignmentId: z.uuid(), publish: z.boolean() }),
  z.object({ action: z.literal('archive'), assignmentId: z.uuid(), archived: z.boolean() }),
  z.object({
    action: z.literal('save-categories'),
    courseId: z.uuid(),
    categories: z
      .array(
        z.object({
          id: z.uuid().optional(),
          name: z.string().trim().min(1, 'Give each category a name').max(80, 'Use 80 characters or fewer'),
          weight: z.number().int('Each weight is a whole number').min(0).max(100, 'Each weight is at most 100'),
        }),
      )
      .min(1, 'Keep at least one category')
      .max(10, 'Use at most 10 categories'),
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
    case 'save': {
      const f = b.fields;
      const text = (await htmlCleaner()).cleanLessonHtml(f.textInstructions);
      if (text.length > 200000) throw new HttpError(400, 'invalid', 'The instructions are too long');
      const { data, error } = await admin.rpc('assignment_save', {
        ...actor,
        p_course: b.courseId,
        p_assignment: b.assignmentId ?? null,
        p_fields: {
          title: f.title,
          description: f.description,
          lesson_id: f.lessonId,
          category_id: f.categoryId,
          content_type: f.contentType,
          text_instructions: text,
          due_at: f.dueAt,
          allow_late: f.allowLate,
          max_marks: f.maxMarks,
          accepted_formats: f.acceptedFormats,
          grading_criteria: f.gradingCriteria,
        },
        p_reason: b.reason ?? null,
      });
      if (error) throw fromDbError(error);
      return json(req, 200, { assignmentId: data, textInstructions: text });
    }
    case 'publish': {
      const { data, error } = await admin.rpc('assignment_set_publication', { ...actor, p_assignment: b.assignmentId, p_publish: b.publish });
      if (error) throw fromDbError(error);
      return json(req, 200, { assignment: data });
    }
    case 'archive': {
      const { data, error } = await admin.rpc('assignment_set_archived', { ...actor, p_assignment: b.assignmentId, p_archived: b.archived });
      if (error) throw fromDbError(error);
      return json(req, 200, { assignment: data });
    }
    case 'save-categories': {
      const { data, error } = await admin.rpc('grade_categories_save', { ...actor, p_course: b.courseId, p_categories: b.categories });
      if (error) throw fromDbError(error);
      return json(req, 200, data);
    }
  }
});
