// bulk-import-learners (SECURITY_AND_ACCESS.md section 8): administrator only. The app parses the
// CSV and sends rows; every row is re-validated here (never trust the client). `commit: false`
// returns a preview with a status per row; `commit: true` invites every valid new learner and
// returns an error report.
// Phase 5: an optional course code per row enrols the learner in that course (D05). A new address
// is invited and enrolled; an existing learner is enrolled; anyone already in the course, an
// unknown or archived course, or a staff address is reported as an error.
// ADR-008: each new or enrolled learner's row carries the ID number the database gave them.
import { z } from 'npm:zod@4.6.7';
import { requireAdmin, serviceClient } from '../_shared/auth.ts';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { audit, findByEmail, invite, Person } from '../_shared/people.ts';

const MAX_ROWS = 500;
const Body = z.object({
  rows: z
    .array(z.object({ firstName: z.string(), secondName: z.string(), email: z.string(), courseCode: z.string().optional() }))
    .min(1)
    .max(MAX_ROWS),
  commit: z.boolean().default(false),
});

type RowResult = { row: number; email: string; status: 'ready' | 'created' | 'enrolled' | 'error'; message?: string; idNumber?: number };
type Course = { id: string; course_code: string; title: string; status: string };

serve(async (req) => {
  const caller = await requireAdmin(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, 'invalid', `Send between 1 and ${MAX_ROWS} rows`);
  const admin = serviceClient();
  const seen = new Set<string>();
  const results: RowResult[] = [];

  // Every course named in the file, looked up once.
  const codes = [...new Set(parsed.data.rows.map((r) => (r.courseCode ?? '').trim().toUpperCase()).filter(Boolean))];
  const courses = new Map<string, Course>();
  if (codes.length) {
    const { data } = await admin.from('courses').select('id, course_code, title, status').in('course_code', codes);
    for (const c of (data ?? []) as Course[]) courses.set(c.course_code, c);
  }

  for (const [i, raw] of parsed.data.rows.entries()) {
    const row = i + 2; // row 1 is the CSV header
    const person = Person.safeParse(raw);
    if (!person.success) {
      results.push({ row, email: String(raw.email ?? ''), status: 'error', message: person.error.issues[0]?.message });
      continue;
    }
    const email = person.data.email;
    if (seen.has(email)) {
      results.push({ row, email, status: 'error', message: 'This address appears more than once in the file' });
      continue;
    }
    seen.add(email);

    const code = (raw.courseCode ?? '').trim().toUpperCase();
    const course = code ? courses.get(code) : undefined;
    if (code && !course) {
      results.push({ row, email, status: 'error', message: `No course has the code ${code}` });
      continue;
    }
    if (course?.status === 'ARCHIVED') {
      results.push({ row, email, status: 'error', message: `${course.course_code} is archived` });
      continue;
    }

    const existing = await findByEmail(admin, email);
    if (existing) {
      if (!course) {
        results.push({ row, email, status: 'error', message: 'An account with this address already exists' });
        continue;
      }
      if (existing.role !== 'LEARNER' || existing.account_status === 'DEACTIVATED') {
        results.push({ row, email, status: 'error', message: 'Only active learner accounts can be enrolled' });
        continue;
      }
      const { count } = await admin
        .from('course_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', course.id)
        .eq('learner_id', existing.id)
        .neq('enrolment_status', 'WITHDRAWN');
      if ((count ?? 0) > 0) {
        results.push({ row, email, status: 'error', message: `Already enrolled in ${course.course_code}` });
        continue;
      }
      if (!parsed.data.commit) {
        results.push({ row, email, status: 'ready', message: `Existing learner, will be enrolled in ${course.course_code}` });
        continue;
      }
      results.push(await withIdNumber(admin, await enrol(admin, caller.id, course, existing.id, row, email, 'enrolled'), existing.id));
      continue;
    }

    if (!parsed.data.commit) {
      results.push({ row, email, status: 'ready', message: course ? `New learner, will be enrolled in ${course.course_code}` : undefined });
      continue;
    }
    let userId: string;
    try {
      userId = await invite(admin, person.data, req.headers.get('Origin'));
    } catch {
      results.push({ row, email, status: 'error', message: 'The invitation email could not be sent' });
      continue;
    }
    const done: RowResult = course ? await enrol(admin, caller.id, course, userId, row, email, 'created') : { row, email, status: 'created' };
    results.push(await withIdNumber(admin, done, userId));
  }

  const summary = {
    total: results.length,
    ready: results.filter((r) => r.status === 'ready').length,
    created: results.filter((r) => r.status === 'created').length,
    errors: results.filter((r) => r.status === 'error').length,
    // Only when the file has a course column, so the Phase 4 summary shape is unchanged.
    ...(codes.length ? { enrolled: results.filter((r) => r.status === 'enrolled').length } : {}),
  };
  if (parsed.data.commit) await audit(admin, caller.id, 'admin.learners_imported', 'profile', null, summary);
  return json(req, 200, { summary, results });
});

/** Adds the ID number the database gave the learner (ADR-008) to a row that succeeded. */
async function withIdNumber(admin: ReturnType<typeof serviceClient>, result: RowResult, learnerId: string): Promise<RowResult> {
  if (result.status === 'error') return result;
  const { data } = await admin.from('profiles').select('id_number').eq('id', learnerId).maybeSingle();
  return data?.id_number ? { ...result, idNumber: data.id_number as number } : result;
}

/** Enrols through the trusted function, so the D05 rules and the audit record apply. */
async function enrol(
  admin: ReturnType<typeof serviceClient>,
  actor: string,
  course: Course,
  learnerId: string,
  row: number,
  email: string,
  status: 'created' | 'enrolled',
): Promise<RowResult> {
  const { error } = await admin.rpc('enrolment_add', { p_actor: actor, p_course: course.id, p_learners: [learnerId] });
  if (error) return { row, email, status: 'error', message: `Could not enrol in ${course.course_code}` };
  return { row, email, status, message: `Enrolled in ${course.course_code}` };
}
