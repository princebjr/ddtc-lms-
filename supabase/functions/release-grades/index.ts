// release-grades (Phase 9; D12, D16, D31; owner decision 1): the course's lecturers and AAL2
// administrators release one learner's draft grade or every draft grade of an assignment. The database
// function re-checks the actor and the course, refuses while the category weights do not total 100,
// shows each learner the grade, writes one notification per learner and event, and audits each release.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.object({
  assignmentId: z.uuid(),
  // Absent: every draft grade of the assignment.
  learnerId: z.uuid().optional(),
});

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const { assignmentId, learnerId } = parsed.data;
  const { data, error } = await serviceClient().rpc('grade_release', {
    p_actor: caller.id,
    p_as_admin: caller.isAdmin,
    p_assignment: assignmentId,
    p_learner: learnerId ?? null,
  });
  if (error) throw fromDbError(error);
  return json(req, 200, { released: data as number });
});
