// release-grades (Phase 9; D12, D16, D31; owner decision 1): the course's lecturers and AAL2
// administrators release one learner's draft grade or every draft grade of an assignment; since Phase 10
// (owner request 2026-11-10) also every draft grade of a whole course at once, after reviewing them.
// The database functions re-check the actor and the course, refuse while the category weights do not
// total 100, show each learner the grade, write one notification per learner and event, and audit.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.union([
  z.object({
    assignmentId: z.uuid(),
    // Absent: every draft grade of the assignment.
    learnerId: z.uuid().optional(),
  }),
  z.object({ courseId: z.uuid() }),
]);

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  const admin = serviceClient();
  const actor = { p_actor: caller.id, p_as_admin: caller.isAdmin };
  const { data, error } =
    'courseId' in b
      ? await admin.rpc('grade_release_course', { ...actor, p_course: b.courseId })
      : await admin.rpc('grade_release', { ...actor, p_assignment: b.assignmentId, p_learner: b.learnerId ?? null });
  if (error) throw fromDbError(error);
  return json(req, 200, { released: data as number });
});
