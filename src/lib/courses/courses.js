import { likeTerm } from '@/lib/admin/users.js';
import { callFunction } from '@/lib/functions.js';
import { getSupabase } from '@/lib/supabase.js';

// Course data (Phase 5). Reads go through RLS: an administrator (AAL2) reads every course, a
// lecturer the courses they teach, a learner the PUBLISHED or ARCHIVED courses they are enrolled in.
// Creating, the lifecycle, lecturers and enrolments go through Edge Functions, which re-check
// every right on the server. Detail fields are saved directly, protected by column grants and the
// courses_guard trigger.

/** @typedef {'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED'} CourseStatus */
/** @typedef {'ACTIVE' | 'COMPLETED' | 'WITHDRAWN' | 'SUSPENDED'} EnrolmentStatus */

/**
 * @typedef {object} CourseSummary
 * @property {string} id
 * @property {string} title
 * @property {string} course_code
 * @property {string} category
 * @property {CourseStatus} status
 * @property {string} updated_at
 * @property {string | null} return_reason
 * @property {string | null} submitted_at
 * @property {number} learners
 * @property {string} owner  owner's name (administrators only; '' otherwise)
 * @property {string | null} ownerId
 */

/**
 * @typedef {object} Course
 * @property {string} id
 * @property {string} title
 * @property {string} course_code
 * @property {string} description
 * @property {string} learning_objectives
 * @property {string} category
 * @property {CourseStatus} status
 * @property {string | null} return_reason
 * @property {string | null} cover_image_file_id
 * @property {string | null} published_at
 * @property {string | null} archived_at
 * @property {string} updated_at
 */

/** @typedef {{ lecturer_id: string, first_name: string, second_name: string, profile_image_path: string | null, permission_level: 'OWNER' | 'CO_LECTURER' }} Teacher */

export const COURSE_STATUS_LABEL = /** @type {const} */ ({
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
});
/** @type {Record<CourseStatus, 'success' | 'warning' | 'neutral' | 'info'>} */
export const COURSE_STATUS_TONE = { DRAFT: 'neutral', PENDING_APPROVAL: 'warning', PUBLISHED: 'success', ARCHIVED: 'neutral' };

export const ENROLMENT_STATUS_LABEL = /** @type {const} */ ({
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  WITHDRAWN: 'Withdrawn',
  SUSPENDED: 'Suspended',
});
/** @type {Record<EnrolmentStatus, 'success' | 'warning' | 'neutral' | 'info'>} */
export const ENROLMENT_STATUS_TONE = { ACTIVE: 'success', COMPLETED: 'info', WITHDRAWN: 'neutral', SUSPENDED: 'warning' };

const DETAIL = 'id, title, course_code, description, learning_objectives, category, status, return_reason, cover_image_file_id, published_at, archived_at, updated_at';
const SUMMARY = 'id, title, course_code, category, status, updated_at, return_reason, submitted_at';

/**
 * Courses for a list: every course for an administrator, the lecturer's own courses for a
 * lecturer (RLS decides). Administrators also get the owner's name.
 * @param {{ search?: string, status?: '' | CourseStatus, returned?: boolean, withOwner?: boolean, limit?: number }} q
 * @returns {Promise<CourseSummary[]>}
 */
export async function fetchCourses({ search = '', status = '', returned = false, withOwner = false, limit = 200 } = {}) {
  const owner = withOwner
    ? ', course_lecturers(lecturer_id, permission_level, removed_at, profiles!course_lecturers_lecturer_id_fkey(first_name, second_name))'
    : '';
  let query = getSupabase()
    .from('courses')
    .select(`${SUMMARY}, course_enrollments(count)${owner}`)
    .neq('course_enrollments.enrolment_status', 'WITHDRAWN');
  if (status) query = query.eq('status', status);
  if (returned) query = query.not('return_reason', 'is', null);
  const term = likeTerm(search);
  if (term) query = query.or(`title.ilike.*${term}*,course_code.ilike.*${term}*`);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((/** @type {any} */ c) => {
    const ownerRow = (c.course_lecturers ?? []).find((/** @type {any} */ l) => l.permission_level === 'OWNER' && !l.removed_at);
    const person = ownerRow?.profiles;
    return {
      id: c.id,
      title: c.title,
      course_code: c.course_code,
      category: c.category,
      status: c.status,
      updated_at: c.updated_at,
      return_reason: c.return_reason,
      submitted_at: c.submitted_at,
      learners: c.course_enrollments?.[0]?.count ?? 0,
      owner: person ? `${person.first_name} ${person.second_name}` : '',
      ownerId: ownerRow?.lecturer_id ?? null,
    };
  });
}

/** @param {string} id @returns {Promise<Course | null>} */
export async function fetchCourse(id) {
  const { data, error } = await getSupabase().from('courses').select(DETAIL).eq('id', id).maybeSingle();
  if (error) throw error;
  return /** @type {Course | null} */ (data);
}

/** @param {string} id @returns {Promise<Teacher[]>} */
export async function fetchTeachers(id) {
  const { data, error } = await getSupabase().rpc('course_teachers', { p_course: id });
  if (error) throw error;
  return /** @type {Teacher[]} */ (data ?? []);
}

/**
 * Learners of a course by name and photo only (lecturers and administrators).
 * @param {string} id
 * @returns {Promise<Array<{ enrolment_id: string, learner_id: string, first_name: string, second_name: string, profile_image_path: string | null, enrolment_status: EnrolmentStatus, enrolled_at: string }>>}
 */
export async function fetchRoster(id) {
  const { data, error } = await getSupabase().rpc('course_roster', { p_course: id });
  if (error) throw error;
  return /** @type {any} */ (data ?? []);
}

/**
 * The signed-in learner's courses with their enrolment status (ACTIVE and COMPLETED only; RLS hides
 * draft and pending courses, so those rows come back without a course and are dropped).
 * @returns {Promise<Array<{ enrolment_status: EnrolmentStatus, course: Course }>>}
 */
export async function fetchMyEnrolledCourses() {
  const { data, error } = await getSupabase()
    .from('course_enrollments')
    .select(`enrolment_status, courses(${DETAIL})`)
    .in('enrolment_status', ['ACTIVE', 'COMPLETED'])
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((/** @type {any} */ r) => r.courses)
    .map((/** @type {any} */ r) => ({ enrolment_status: r.enrolment_status, course: r.courses }));
}

/** The signed-in learner's enrolment in one course, or null. @param {string} courseId @returns {Promise<EnrolmentStatus | null>} */
export async function fetchMyEnrolment(courseId) {
  const { data, error } = await getSupabase()
    .from('course_enrollments')
    .select('enrolment_status')
    .eq('course_id', courseId)
    .in('enrolment_status', ['ACTIVE', 'COMPLETED'])
    .maybeSingle();
  if (error) throw error;
  return /** @type {EnrolmentStatus | null} */ (data?.enrolment_status ?? null);
}

/**
 * Saves a course's details (lecturers of the course or an administrator; never status).
 * @param {string} id
 * @param {{ title: string, courseCode: string, description: string, learningObjectives: string, category: string }} fields
 */
export async function saveCourseDetails(id, fields) {
  const { error } = await getSupabase()
    .from('courses')
    .update({
      title: fields.title,
      course_code: fields.courseCode,
      description: fields.description,
      learning_objectives: fields.learningObjectives,
      category: fields.category,
    })
    .eq('id', id);
  if (error) throw error;
}

/**
 * @param {{ title: string, courseCode: string, description: string, learningObjectives: string, category: string, ownerId?: string }} fields
 * @returns {Promise<string>} the new course id
 */
export async function createCourse(fields) {
  const res = /** @type {{ courseId: string }} */ (await callFunction('create-course', fields));
  return res.courseId;
}

/**
 * @param {string} courseId
 * @param {'submit' | 'publish' | 'approve' | 'return' | 'archive' | 'unarchive'} action
 * @param {{ reason?: string, grantDirect?: boolean }} [options]
 * @returns {Promise<CourseStatus>}
 */
export async function transitionCourse(courseId, action, options = {}) {
  const res = /** @type {{ course: { status: CourseStatus } }} */ (await callFunction('course-lifecycle', { courseId, action, ...options }));
  return res.course.status;
}

/**
 * @param {string} courseId
 * @param {{ lecturerId: string } | { lecturerEmail: string }} who  lecturers name a colleague by email
 * @param {'add' | 'remove' | 'transfer'} action
 * @returns {Promise<string>} the lecturer's id (resolved on the server when named by email)
 */
export async function changeLecturer(courseId, who, action) {
  const res = /** @type {{ change: { lecturer: string } }} */ (await callFunction('course-lecturers', { courseId, ...who, action }));
  return res.change.lecturer;
}

/** Active lecturers, for owner and co-lecturer pickers (administrators read all profiles). */
export async function fetchActiveLecturers() {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, first_name, second_name, email')
    .eq('role', 'LECTURER')
    .eq('account_status', 'ACTIVE')
    .order('first_name')
    .limit(500);
  if (error) throw error;
  return /** @type {Array<{ id: string, first_name: string, second_name: string, email: string }>} */ (data ?? []);
}

/** Courses a lecturer owns that are not archived (the deactivation hand-over). @param {string} lecturerId */
export async function fetchOwnedActiveCourses(lecturerId) {
  const { data, error } = await getSupabase()
    .from('course_lecturers')
    .select('course_id, courses!inner(id, title, course_code, status)')
    .eq('lecturer_id', lecturerId)
    .eq('permission_level', 'OWNER')
    .is('removed_at', null)
    .neq('courses.status', 'ARCHIVED');
  if (error) throw error;
  return (data ?? []).map((/** @type {any} */ r) => /** @type {{ id: string, title: string, course_code: string, status: CourseStatus }} */ (r.courses));
}

/** Administrator dashboard counts (Phase 5). @returns {Promise<{ published: number, pending: number, enrolments: number }>} */
export async function fetchCourseCounts() {
  const supabase = getSupabase();
  const [published, pending, enrolments] = await Promise.all([
    supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
    supabase.from('courses').select('id', { count: 'exact', head: true }).eq('status', 'PENDING_APPROVAL'),
    supabase.from('course_enrollments').select('id', { count: 'exact', head: true }).eq('enrolment_status', 'ACTIVE'),
  ]);
  const failed = [published, pending, enrolments].find((r) => r.error);
  if (failed?.error) throw failed.error;
  return { published: published.count ?? 0, pending: pending.count ?? 0, enrolments: enrolments.count ?? 0 };
}
