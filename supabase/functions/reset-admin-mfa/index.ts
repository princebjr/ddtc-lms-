// reset-admin-mfa (D32): an administrator resets another administrator's authenticator after a
// lost device. The database checks the rule (not yourself, target is an administrator, at most 3
// per hour), revokes the target's sessions and audits; then every MFA factor of the target is
// removed, so they enrol a new authenticator at their next sign-in.
import { z } from 'npm:zod@4.6.7';
import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.object({ userId: z.uuid() });

serve(async (req) => {
  const caller = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', 'A user id is required');
  const target = parsed.data.userId;

  const admin = serviceClient();
  const { error } = await admin.rpc('admin_record_mfa_reset', { p_actor: caller.id, p_target: target });
  if (error) throw fromDbError(error);

  const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: target });
  if (listError) throw new HttpError(500, 'server_error', 'Could not read the authenticator list');
  for (const factor of factors?.factors ?? []) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ userId: target, id: factor.id });
    if (deleteError) throw new HttpError(500, 'server_error', 'Could not remove an authenticator');
  }
  return json(req, 200, { reset: true, removedFactors: factors?.factors?.length ?? 0 });
});
