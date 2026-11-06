// set-user-role (SECURITY_AND_ACCESS.md section 8): administrator only. Changes a user's role,
// course-creation permission, direct publishing (ADR-005) and account status. The database
// functions re-check the actor, refuse self-changes, refuse to take a lecturer who still owns active
// courses out of teaching (transfer first), revoke sessions on suspension or deactivation, remove
// Google from new staff accounts and audit every change with the acting administrator.
import { z } from 'npm:zod@4.6.7';
import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z
  .object({
    userId: z.uuid(),
    role: z.enum(['ADMIN', 'LECTURER', 'LEARNER']).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
    canCreateCourses: z.boolean().optional(),
    canPublishDirectly: z.boolean().optional(),
  })
  .refine(
    (b) => b.role !== undefined || b.status !== undefined || b.canCreateCourses !== undefined || b.canPublishDirectly !== undefined,
    'Nothing to change',
  );

serve(async (req) => {
  const caller = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();

  let user: unknown = null;
  if (b.role !== undefined || b.status !== undefined || b.canCreateCourses !== undefined) {
    const { data, error } = await admin.rpc('admin_set_user', {
      p_actor: caller.id,
      p_target: b.userId,
      p_role: b.role ?? null,
      p_status: b.status ?? null,
      p_can_create: b.canCreateCourses ?? null,
    });
    if (error) throw fromDbError(error);
    user = data;
  }
  if (b.canPublishDirectly !== undefined) {
    const { data, error } = await admin.rpc('admin_set_direct_publish', {
      p_actor: caller.id,
      p_target: b.userId,
      p_value: b.canPublishDirectly,
    });
    if (error) throw fromDbError(error);
    user = { ...(user as object | null ?? {}), ...(data as object) };
  }
  return json(req, 200, { user });
});
