import { callFunction } from '@/lib/functions.js';
import { getSupabase } from '@/lib/supabase.js';

// The gradebook (Phase 10; D11 to D15, D30; owner request of 2026-11-10: each course has its own
// gradebook, and a learner sees one course's grades apart from another's). Every figure comes from the
// database: calculate_course_grades() gives each learner's cells, category percentages, overall grade
// and status; assignment_statistics() the class figures and chart counts (released results only,
// suppressed below min_class_size for learners). Nothing here computes a grade (D30): this file only
// fetches, labels and downloads.

/** @typedef {'RELEASED' | 'DRAFT' | 'UNGRADED' | 'COUNTED_ZERO' | 'MISSING' | 'NOT_DUE'} CellState */
/** @typedef {'FINAL' | 'PROVISIONAL' | 'NOT_AVAILABLE'} GradeStatus */

/**
 * @typedef {object} GradeCell
 * @property {string} assignment_id
 * @property {string} category_id
 * @property {CellState} state
 * @property {number | null} score
 * @property {number} max_marks
 * @property {boolean} is_late
 * @property {boolean} counted
 * @property {boolean} published
 * @property {string} effective_due_at
 * @property {number | null} percentage
 * @property {string | null} letter_grade
 * @property {string | null} band
 */
/**
 * @typedef {object} CategoryResult
 * @property {string} category_id
 * @property {string} name
 * @property {number} weight
 * @property {number} earned
 * @property {number} possible
 * @property {number} counted_items
 * @property {number | null} percentage
 */
/**
 * @typedef {object} LearnerGrades  one learner's row of the gradebook
 * @property {string} learner_id
 * @property {string} first_name
 * @property {string} second_name
 * @property {number | null} id_number
 * @property {string | null} branch_name
 * @property {string | null} profile_image_path
 * @property {'ACTIVE' | 'COMPLETED' | 'WITHDRAWN' | 'SUSPENDED'} enrolment_status
 * @property {number | null} overall_percentage
 * @property {string | null} letter_grade
 * @property {string | null} band
 * @property {GradeStatus} status
 * @property {CategoryResult[]} categories
 * @property {GradeCell[]} cells
 */
/**
 * @typedef {object} GradebookColumn
 * @property {string} assignment_id
 * @property {string} title
 * @property {string} category_id
 * @property {string} category_name
 * @property {number} max_marks
 * @property {string} due_at
 * @property {boolean} published
 * @property {import('@/lib/assignments/assignments.js').GradePart} part  since Phase 10.1 (ADR-016)
 */
/**
 * @typedef {object} AssignmentStats
 * @property {string} assignment_id
 * @property {number} released
 * @property {number} ungraded
 * @property {number} missing
 * @property {number | null} average
 * @property {number | null} highest
 * @property {number | null} lowest
 * @property {Array<{ band: string, count: number }>} distribution
 * @property {boolean} chart_visible
 * @property {string | null} my_band
 */
/**
 * @typedef {object} CourseGradebook
 * @property {GradebookColumn[]} columns
 * @property {LearnerGrades[]} learners
 * @property {AssignmentStats[]} stats
 */

/**
 * One course's gradebook. For the course's lecturers and AAL2 administrators: every counted learner,
 * drafts included (an administrator's view is audited). For a learner enrolled in it: their own row,
 * released results only. Anyone else gets no rows.
 * @param {string} courseId
 * @returns {Promise<CourseGradebook>}
 */
export async function fetchCourseGradebook(courseId) {
  const supabase = getSupabase();
  const [columns, learners, stats] = await Promise.all([
    supabase.rpc('gradebook_assignments', { p_course: courseId }),
    supabase.rpc('calculate_course_grades', { p_course: courseId }),
    supabase.rpc('assignment_statistics', { p_course: courseId }),
  ]);
  for (const r of [columns, learners, stats]) if (r.error) throw r.error;
  return {
    columns: /** @type {GradebookColumn[]} */ (columns.data ?? []),
    learners: /** @type {LearnerGrades[]} */ (learners.data ?? []),
    stats: /** @type {AssignmentStats[]} */ ((stats.data ?? []).map((/** @type {any} */ s) => ({
      ...s,
      distribution: (s.distribution ?? []).map((/** @type {any} */ d) => ({ band: d.band, count: Number(d.count) })),
    }))),
  };
}

/**
 * The signed-in learner's courses, each with its own course grade (owner request of 2026-11-10: one
 * course's grades apart from another's). Active and completed enrolments.
 * @returns {Promise<Array<{ course: { id: string, title: string, course_code: string }, enrolment_status: string, grade: LearnerGrades | null }>>}
 */
export async function fetchMyCourseGrades() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('enrolment_status, courses(id, title, course_code)')
    .in('enrolment_status', ['ACTIVE', 'COMPLETED'])
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).filter((/** @type {any} */ r) => r.courses);
  return Promise.all(
    rows.map(async (/** @type {any} */ r) => {
      const grades = await supabase.rpc('calculate_course_grades', { p_course: r.courses.id });
      if (grades.error) throw grades.error;
      return { course: r.courses, enrolment_status: r.enrolment_status, grade: /** @type {LearnerGrades | null} */ ((grades.data ?? [])[0] ?? null) };
    }),
  );
}

/** Whether a grade of the course has been released, so its category weights are locked (D12, D13). @param {string} courseId */
export async function fetchWeightsLocked(courseId) {
  const { data, error } = await getSupabase().rpc('course_weights_locked', { p_course: courseId });
  if (error) throw error;
  return data === true;
}

/**
 * What each learner's overall grade would become with new weights (owner decision 4: the
 * administrator sees the impact before changing weights after release).
 * @param {string} courseId
 * @param {Array<{ id: string, weight: number }>} weights
 * @returns {Promise<Array<{ learner_id: string, first_name: string, second_name: string, current_overall: number | null, new_overall: number | null }>>}
 */
export async function previewWeightsImpact(courseId, weights) {
  const { data, error } = await getSupabase().rpc('weights_impact_preview', { p_course: courseId, p_categories: weights });
  if (error) throw error;
  return /** @type {any} */ (data ?? []);
}

/**
 * @typedef {object} PendingRelease  a draft grade waiting to be released (owner decision 1)
 * @property {string} assignment_id
 * @property {string} assignment_title
 * @property {string} learner_id
 * @property {string} first_name
 * @property {string} second_name
 * @property {number | null} id_number
 * @property {string | null} branch_name
 * @property {number} score
 * @property {number} max_marks
 * @property {number | null} percentage
 * @property {string | null} letter_grade
 * @property {boolean} changed  a released grade that was changed since
 * @property {number | null} released_score
 */

/** Every draft grade of the course, for review before releasing them all. @param {string} courseId */
export async function fetchReleasePreview(courseId) {
  const { data, error } = await getSupabase().rpc('course_release_preview', { p_course: courseId });
  if (error) throw error;
  return /** @type {PendingRelease[]} */ (data ?? []);
}

/** Releases every draft grade of the course at once. @param {string} courseId @returns {Promise<{ released: number }>} */
export function releaseCourseGrades(courseId) {
  return callFunction('release-grades', { courseId });
}

/**
 * Exports the course gradebook, or one assignment's performance report, as CSV or Excel (the
 * export is built and audited by export-gradebook).
 * @param {{ kind: 'gradebook', courseId: string, format: 'csv' | 'xlsx' } | { kind: 'assignment', assignmentId: string, format: 'csv' | 'xlsx' }} request
 * @returns {Promise<{ filename: string, contentType: string, content: string }>}
 */
export function exportGrades(request) {
  return callFunction('export-gradebook', request);
}

/** Saves a base64 file the server built. @param {{ filename: string, contentType: string, content: string }} file */
export function downloadFile({ filename, contentType, content }) {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The status of a course grade in words (D13). */
export const STATUS_LABEL = Object.freeze({ FINAL: 'Final', PROVISIONAL: 'Provisional', NOT_AVAILABLE: 'Not yet available' });
/** @type {Readonly<Record<GradeStatus, 'success' | 'warning' | 'neutral'>>} */
export const STATUS_TONE = Object.freeze({ FINAL: 'success', PROVISIONAL: 'warning', NOT_AVAILABLE: 'neutral' });

/**
 * A gradebook cell in words (D11: every state distinct, never colour alone). Staff see drafts with
 * their score; a learner never gets a DRAFT cell (the database shows it to them as UNGRADED).
 * @param {CellState} state
 * @param {'staff' | 'learner'} [audience]
 * @param {boolean} [practical] a practical marked in person (Phase 10.1): waiting means Not marked
 * @returns {{ label: string, tone: 'success' | 'warning' | 'error' | 'info' | 'neutral' }}
 */
export function cellState(state, audience = 'staff', practical = false) {
  if (practical && state === 'UNGRADED') return { label: audience === 'learner' ? 'Not marked yet' : 'Not marked', tone: 'neutral' };
  switch (state) {
    case 'RELEASED':
      return { label: audience === 'learner' ? 'Graded' : 'Released', tone: 'success' };
    case 'DRAFT':
      return { label: 'Draft', tone: 'warning' };
    case 'UNGRADED':
      return { label: audience === 'learner' ? 'Awaiting grade' : 'Ungraded', tone: 'info' };
    case 'COUNTED_ZERO':
      return { label: 'Counted as 0', tone: 'error' };
    case 'MISSING':
      return { label: 'Missing', tone: 'error' };
    default:
      return { label: 'Not yet due', tone: 'neutral' };
  }
}

/**
 * The text summary of a distribution chart (always visible, DESIGN.md 13): the largest group and the
 * counts, from the database's figures.
 * @param {AssignmentStats} s
 * @param {number | null} [myScore] the learner's own percentage, when shown to a learner
 */
export function chartSummary(s, myScore = null) {
  const total = s.distribution.reduce((n, d) => n + d.count, 0);
  if (!total) return 'No released grades yet.';
  const top = s.distribution.reduce((a, b) => (b.count > a.count ? b : a));
  const mine = s.my_band ? ` Your score${myScore === null ? '' : ` (${Number(myScore)}%)`} is in band ${s.my_band}, highlighted. A band is not a rank.` : '';
  return `${top.count} of ${total} ${total === 1 ? 'learner' : 'learners'} scored ${top.band}, the largest group. ${s.released} graded, ${s.ungraded} ungraded, ${s.missing} missing.${mine}`;
}

// ---------------------------------------------------------------- the three parts of the course grade (Phase 10.1, ADR-016)

/** Whether the course has the three parts (Weekly assignments, Local Assembly practicals, Final examinations). @param {string} courseId */
export async function fetchUsesStandardParts(courseId) {
  const { data, error } = await getSupabase().rpc('course_uses_standard_parts', { p_course: courseId });
  if (error) throw error;
  return data === true;
}

/**
 * Each learner's overall grade now and once the course switches to the three parts (nothing is kept).
 * @param {string} courseId
 * @returns {Promise<Array<{ learner_id: string, first_name: string, second_name: string, current_overall: number | null, new_overall: number | null }>>}
 */
export async function previewStandardParts(courseId) {
  const { data, error } = await getSupabase().rpc('standard_parts_preview', { p_course: courseId });
  if (error) throw error;
  return /** @type {any} */ (data ?? []);
}

/** Switches a course to the three parts (an administrator, with a reason). @param {string} courseId @param {string} reason */
export function applyStandardParts(courseId, reason) {
  return callFunction('manage-assignments', { action: 'apply-parts', courseId, reason });
}
