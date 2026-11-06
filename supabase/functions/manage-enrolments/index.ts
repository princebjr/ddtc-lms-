// manage-enrolments (D05): administrator only. `add` enrols up to 500 learners in a course (those
// already enrolled are skipped); `status` sets ACTIVE, COMPLETED, WITHDRAWN or SUSPENDED and returns
// each previous status so the app can offer Undo. Every change is audited.
import { z } from 'npm:zod@4.6.7';
import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), courseId: z.uuid(), learnerIds: z.array(z.uuid()).min(1).max(500) }),
  z.object({
    action: z.literal('status'),
    enrolmentIds: z.array(z.uuid()).min(1).max(500),
    status: z.enum(['ACTIVE', 'COMPLETED', 'WITHDRAWN', 'SUSPENDED']),
  }),
]);

serve(async (req) => {
  const caller = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();

  if (b.action === 'add') {
    const { data, error } = await admin.rpc('enrolment_add', { p_actor: caller.id, p_course: b.courseId, p_learners: b.learnerIds });
    if (error) throw fromDbError(error);
    return json(req, 200, data);
  }
  const { data, error } = await admin.rpc('enrolment_set_status', { p_actor: caller.id, p_enrolments: b.enrolmentIds, p_status: b.status });
  if (error) throw fromDbError(error);
  return json(req, 200, { changes: data });
});
