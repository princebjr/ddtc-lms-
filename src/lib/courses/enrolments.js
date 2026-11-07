import { likeTerm, userSearchFilter } from '@/lib/admin/users.js';
import { callFunction } from '@/lib/functions.js';
import { getSupabase } from '@/lib/supabase.js';

// Administrator enrolment data (D05). Reads go through RLS; changes through manage-enrolments.

/** @typedef {import('./courses.js').EnrolmentStatus} EnrolmentStatus */

/**
 * @typedef {object} EnrolmentRow
 * @property {string} id
 * @property {EnrolmentStatus} enrolment_status
 * @property {string} enrolled_at
 * @property {{ id: string, first_name: string, second_name: string, email: string, profile_image_file_id: string | null }} learner
 * @property {{ id: string, title: string, course_code: string, status: import('./courses.js').CourseStatus }} course
 */

/**
 * @param {{ courseId?: string, status?: '' | EnrolmentStatus, search?: string, limit?: number }} q
 * @returns {Promise<EnrolmentRow[]>}
 */
export async function fetchEnrolments({ courseId = '', status = '', search = '', limit = 200 } = {}) {
  const term = likeTerm(search);
  let query = getSupabase()
    .from('course_enrollments')
    .select(
      `id, enrolment_status, enrolled_at,
       learner:profiles!course_enrollments_learner_id_fkey${term ? '!inner' : ''}(id, first_name, second_name, email, profile_image_file_id),
       course:courses!inner(id, title, course_code, status)`,
    );
  if (courseId) query = query.eq('course_id', courseId);
  if (status) query = query.eq('enrolment_status', status);
  if (term) query = query.or(`first_name.ilike.*${term}*,second_name.ilike.*${term}*,email.ilike.*${term}*`, { referencedTable: 'learner' });
  const { data, error } = await query.order('enrolled_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return /** @type {EnrolmentRow[]} */ (/** @type {unknown} */ (data ?? []));
}

/** Active learners matching a search, for the Enrol learners picker. @param {string} search */
export async function searchLearners(search) {
  const filter = userSearchFilter(search);
  let query = getSupabase().from('profiles').select('id, id_number, first_name, second_name, email').eq('role', 'LEARNER').eq('account_status', 'ACTIVE');
  if (filter) query = query.or(filter);
  const { data, error } = await query.order('first_name').limit(50);
  if (error) throw error;
  return /** @type {Array<{ id: string, id_number: number, first_name: string, second_name: string, email: string }>} */ (data ?? []);
}

/**
 * @param {string} courseId @param {string[]} learnerIds
 * @returns {Promise<{ enrolled: string[], skipped: number }>}
 */
export async function enrolLearners(courseId, learnerIds) {
  return /** @type {{ enrolled: string[], skipped: number }} */ (await callFunction('manage-enrolments', { action: 'add', courseId, learnerIds }));
}

/**
 * @param {string[]} enrolmentIds @param {EnrolmentStatus} status
 * @returns {Promise<Array<{ id: string, previous: EnrolmentStatus }>>}
 */
export async function setEnrolmentStatus(enrolmentIds, status) {
  const res = /** @type {{ changes: Array<{ id: string, previous: EnrolmentStatus }> }} */ (
    await callFunction('manage-enrolments', { action: 'status', enrolmentIds, status })
  );
  return res.changes;
}

/**
 * Undo for a status change: puts each enrolment back to its previous status (grouped per status).
 * @param {Array<{ id: string, previous: EnrolmentStatus }>} changes
 */
export async function restoreEnrolments(changes) {
  /** @type {Map<EnrolmentStatus, string[]>} */
  const groups = new Map();
  for (const c of changes) groups.set(c.previous, [...(groups.get(c.previous) ?? []), c.id]);
  for (const [status, ids] of groups) await setEnrolmentStatus(ids, status);
}
