// course-lifecycle (D04, D07, ADR-005): submit (lecturer), publish, approve or return with a reason
// (administrator), archive and unarchive (OWNER or administrator). The database function checks the
// actor's role and course permission and the allowed status change, and audits it.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.object({
  courseId: z.uuid(),
  action: z.enum(['submit', 'publish', 'approve', 'return', 'archive', 'unarchive']),
  reason: z.string().trim().max(1000).optional(),
  grantDirect: z.boolean().default(false),
});

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;

  const { data, error } = await serviceClient().rpc('course_transition', {
    p_actor: caller.id,
    p_as_admin: caller.isAdmin,
    p_course: b.courseId,
    p_action: b.action,
    p_reason: b.reason ?? null,
    p_grant_direct: b.grantDirect,
  });
  if (error) throw fromDbError(error);
  return json(req, 200, { course: data });
});
