// delete-media (ADR-007, owner decisions 2026-11-07): administrators and the course's lecturers
// delete a lesson audio (in use or a history version), a lesson attachment, or a course cover.
//   1. The trusted database function re-checks the actor and the course (archived courses are
//      read-only), takes the item out of the lesson or course at once and keeps its record with
//      who deleted it and when (audited). If this fails nothing has changed and the item stays.
//   2. The file is then removed from Storage. If that fails it is marked DELETE_FAILED and the
//      hourly cleanup-files job retries, so learners never meet a broken player and no file is
//      left behind. A file already missing counts as removed.
// Deleting something already deleted answers the same (already: true). Nobody can delete these
// rows or files directly: there is no client DELETE privilege or Storage policy.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';
import { removeStoredFile } from '../_shared/remove-file.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';

const Body = z.object({
  kind: z.enum(['lesson-audio', 'lesson-attachment', 'course-cover']),
  id: z.uuid(),
});

/** The database function for each kind, and the name of its id parameter. */
const FUNCTIONS = {
  'lesson-audio': ['lesson_audio_delete', 'p_audio'],
  'lesson-attachment': ['lesson_attachment_delete', 'p_attachment'],
  'course-cover': ['course_cover_remove', 'p_course'],
} as const;

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', 'Choose what to delete');
  const [fn, param] = FUNCTIONS[parsed.data.kind];
  const admin = serviceClient();
  await takeRateLimit(admin, caller.id, 'delete-media');

  const { data, error } = await admin.rpc(fn, { p_actor: caller.id, p_as_admin: caller.isAdmin, [param]: parsed.data.id });
  if (error) throw fromDbError(error);
  const result = data as { file: string | null; already?: boolean };
  if (!result.file) return json(req, 200, { deleted: true, already: true, fileRemoved: true }); // a course without a cover

  const fileRemoved = await removeStoredFile(admin, result.file);
  return json(req, 200, { deleted: true, already: Boolean(result.already), fileRemoved });
});
