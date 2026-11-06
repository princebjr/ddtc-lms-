// create-course (SECURITY_AND_ACCESS.md section 8): a lecturer with can_create_courses creates a
// course they own; an administrator (two-step verified) creates one for any active lecturer, who
// becomes OWNER. The database function checks the right, creates the course, the OWNER row and the
// audit record in one transaction. The course starts as DRAFT.
import { z } from 'npm:zod@4.6.7';
import { requireStaff, serviceClient } from '../_shared/auth.ts';
import { fromDbError, HttpError, json, readJson, serve } from '../_shared/http.ts';

const Body = z.object({
  title: z.string().trim().min(3, 'Enter a title of at least 3 characters').max(150),
  courseCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2 to 20 letters, digits or dashes'),
  description: z.string().max(5000).default(''),
  learningObjectives: z.string().max(5000).default(''),
  category: z.string().trim().max(100).default(''),
  ownerId: z.uuid().optional(),
});

serve(async (req) => {
  const caller = await requireStaff(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Invalid request');
  const b = parsed.data;
  if (caller.isAdmin && !b.ownerId) throw new HttpError(400, 'invalid', 'Choose the lecturer who will own the course');

  const { data, error } = await serviceClient().rpc('course_create', {
    p_actor: caller.id,
    p_as_admin: caller.isAdmin,
    p_owner: caller.isAdmin ? b.ownerId : caller.id,
    p_title: b.title,
    p_code: b.courseCode,
    p_description: b.description,
    p_objectives: b.learningObjectives,
    p_category: b.category,
  });
  if (error) throw fromDbError(error);
  return json(req, 200, { courseId: data });
});
