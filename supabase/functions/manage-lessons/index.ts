// manage-lessons (D08): course lecturers and administrators save lessons (content cleaned against
// an allow-list first), publish and unpublish them, reorder all of a course's lessons at once, and
// remove attachments (the row and file are kept). The database functions re-check the actor and the
// course (archived courses are read-only) and audit every change.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';
import { cleanLessonHtml } from '../_shared/lesson-html.ts';

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    courseId: z.uuid(),
    lessonId: z.uuid().optional(),
    title: z.string().trim().min(3, 'Enter a title of at least 3 characters').max(200, 'Use 200 characters or fewer'),
    content: z.string().max(400000, 'The lesson is too long'),
  }),
  z.object({ action: z.literal('publish'), lessonId: z.uuid(), publish: z.boolean() }),
  z.object({ action: z.literal('reorder'), courseId: z.uuid(), lessonIds: z.array(z.uuid()).min(1).max(500) }),
  z.object({ action: z.literal('remove-attachment'), attachmentId: z.uuid() }),
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
      const content = cleanLessonHtml(b.content);
      if (content.length > 200000) throw new HttpError(400, 'invalid', 'The lesson is too long');
      const { data, error } = await admin.rpc('lesson_save', {
        ...actor,
        p_course: b.courseId,
        p_lesson: b.lessonId ?? null,
        p_title: b.title,
        p_content: content,
      });
      if (error) throw fromDbError(error);
      return json(req, 200, { lessonId: data, content });
    }
    case 'publish': {
      const { data, error } = await admin.rpc('lesson_set_publication', { ...actor, p_lesson: b.lessonId, p_publish: b.publish });
      if (error) throw fromDbError(error);
      return json(req, 200, { lesson: data });
    }
    case 'reorder': {
      const { error } = await admin.rpc('lesson_reorder', { ...actor, p_course: b.courseId, p_lessons: b.lessonIds });
      if (error) throw fromDbError(error);
      return json(req, 200, { ok: true });
    }
    case 'remove-attachment': {
      const { error } = await admin.rpc('lesson_attachment_remove', { ...actor, p_attachment: b.attachmentId });
      if (error) throw fromDbError(error);
      return json(req, 200, { ok: true });
    }
  }
});
