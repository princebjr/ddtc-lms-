// course-lecturers (D06): the OWNER or an administrator adds or removes a co-lecturer; only an
// administrator transfers ownership (the previous OWNER stays as a co-lecturer). Removal keeps the
// row (removed_at), so course history is preserved. Lecturers cannot list other people, so they name
// a colleague by email address; the server resolves it to an ACTIVE lecturer.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z
  .object({
    courseId: z.uuid(),
    lecturerId: z.uuid().optional(),
    lecturerEmail: z.string().trim().toLowerCase().email('Enter a valid email address').max(320).optional(),
    action: z.enum(['add', 'remove', 'transfer']),
  })
  .refine((b) => b.lecturerId || b.lecturerEmail, 'Choose a lecturer');

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();

  let lecturerId = b.lecturerId;
  if (!lecturerId) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', b.lecturerEmail as string)
      .eq('role', 'LECTURER')
      .eq('account_status', 'ACTIVE')
      .maybeSingle();
    if (!data) throw new HttpError(400, 'invalid', 'No active lecturer has this email address');
    lecturerId = data.id as string;
  }

  const { data, error } = await admin.rpc('course_lecturer_change', {
    p_actor: caller.id,
    p_as_admin: caller.isAdmin,
    p_course: b.courseId,
    p_lecturer: lecturerId,
    p_action: b.action,
  });
  if (error) throw fromDbError(error);
  return json(req, 200, { change: data });
});
