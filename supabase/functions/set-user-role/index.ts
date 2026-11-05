// set-user-role (SECURITY_AND_ACCESS.md section 8): administrator only. Changes a user's role,
// course-creation permission and account status. The database function re-checks the actor,
// refuses self-changes, revokes sessions on suspension or deactivation, removes Google from new
// staff accounts and audits every change with the acting administrator.
import { z } from 'npm:zod@4.6.7';
import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z
  .object({
    userId: z.uuid(),
    role: z.enum(['ADMIN', 'LECTURER', 'LEARNER']).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
    canCreateCourses: z.boolean().optional(),
  })
  .refine((b) => b.role !== undefined || b.status !== undefined || b.canCreateCourses !== undefined, 'Nothing to change');

serve(async (req) => {
  const caller = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;

  const { data, error } = await serviceClient().rpc('admin_set_user', {
    p_actor: caller.id,
    p_target: b.userId,
    p_role: b.role ?? null,
    p_status: b.status ?? null,
    p_can_create: b.canCreateCourses ?? null,
  });
  if (error) throw fromDbError(error);
  return json(req, 200, { user: data });
});
