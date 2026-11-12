// provision-admin (ADR-003): administrator only (AAL2). Invites a new administrator by email, or
// makes an existing account an administrator. The invitation link lets the person choose a password;
// the app then requires TOTP enrolment before any admin page opens. The role change is applied and
// audited by admin_set_user (which also removes any Google sign-in); the invitation is audited here.
// An invited administrator counts towards the two-administrator launch rule only once they accept.
import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';
import { audit, findByEmail, invite, Person } from '../_shared/people.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';

serve(async (req) => {
  const caller = await requireAdmin(req);
  const parsed = Person.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const person = parsed.data;
  const admin = serviceClient();
  await takeRateLimit(admin, caller.id, 'provision-account');

  let userId: string;
  let invited = false;
  const existing = await findByEmail(admin, person.email);
  if (existing) {
    if (existing.role === 'ADMIN') throw new HttpError(409, 'conflict', 'This person is already an administrator');
    if (existing.account_status !== 'ACTIVE') throw new HttpError(409, 'conflict', 'Reactivate this account first');
    userId = existing.id;
  } else {
    try {
      userId = await invite(admin, person, req.headers.get('Origin'));
      invited = true;
    } catch {
      throw new HttpError(502, 'invite_failed', 'The invitation email could not be sent');
    }
  }

  const { error } = await admin.rpc('admin_set_user', {
    p_actor: caller.id,
    p_target: userId,
    p_role: 'ADMIN',
    p_status: null,
    p_can_create: null,
  });
  if (error) throw fromDbError(error);
  await audit(admin, caller.id, invited ? 'admin.administrator_invited' : 'admin.administrator_promoted', 'profile', userId, {});
  return json(req, 200, { userId, invited });
});
