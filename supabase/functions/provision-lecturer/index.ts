// provision-lecturer (SECURITY_AND_ACCESS.md section 8): administrator only. Creates a lecturer
// (invitation email, then the role is applied by admin_set_user) or promotes an existing account.
// Audited: the invitation here, the role and course-creation changes by the database function.
import { z } from 'npm:zod@4.6.7';
import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';
import { audit, findByEmail, invite, Person } from '../_shared/people.ts';

const Body = Person.extend({ canCreateCourses: z.boolean().default(false) });

serve(async (req) => {
  const caller = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();

  let userId: string;
  let invited = false;
  const existing = await findByEmail(admin, b.email);
  if (existing) {
    if (existing.role === 'ADMIN') throw new HttpError(409, 'conflict', 'This address belongs to an administrator');
    userId = existing.id;
  } else {
    try {
      userId = await invite(admin, b, req.headers.get('Origin'));
      invited = true;
    } catch {
      throw new HttpError(502, 'invite_failed', 'The invitation email could not be sent');
    }
  }

  const { error } = await admin.rpc('admin_set_user', {
    p_actor: caller.id,
    p_target: userId,
    p_role: 'LECTURER',
    p_status: null,
    p_can_create: b.canCreateCourses,
  });
  if (error) throw fromDbError(error);
  if (invited) await audit(admin, caller.id, 'admin.lecturer_invited', 'profile', userId, { can_create_courses: b.canCreateCourses });
  return json(req, 200, { userId, invited });
});
