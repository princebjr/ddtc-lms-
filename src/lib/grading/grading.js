import { callFunction } from '@/lib/functions.js';
import { getSupabase } from '@/lib/supabase.js';

// Grading (Phase 9; D12, D14 to D16, D30, D31; owner decisions of 2026-11-09). Every figure on these
// screens comes from the database: scores, percentages, letter grades, bands and the counts are
// computed there (D30), never here. Lecturers and administrators read assignment_results(),
// assignment_result_counts() and submission_review(); grades are saved, reopened and released through
// grade-submission and release-grades. A learner reads only their own released grade (my_grade).

/** A value the database sent (not null) and that is there at all (not undefined). @param {unknown} v */
export const isSet = (v) => v !== null && v !== undefined;

/** Plain text (owner decision 7), counted as the database counts it. */
export const MAX_FEEDBACK = 10000;

/** @typedef {'GRADED' | 'UNGRADED' | 'MISSING' | 'NOT_YET_DUE'} Result */
/**
 * @typedef {object} ResultRow
 * @property {string} learner_id
 * @property {string} first_name
 * @property {string} second_name
 * @property {number | null} id_number
 * @property {string | null} branch_name
 * @property {string | null} profile_image_path
 * @property {'ACTIVE' | 'COMPLETED' | 'WITHDRAWN' | 'SUSPENDED'} enrolment_status
 * @property {boolean} counted  false for a withdrawn learner who had sent an answer (owner decision 4)
 * @property {Result} result
 * @property {string | null} submission_id
 * @property {'SUBMITTED' | 'GRADED' | 'REOPENED' | null} status
 * @property {number | null} current_version
 * @property {string | null} submitted_at
 * @property {boolean | null} is_late
 * @property {string | null} extended_due_at
 * @property {string} effective_due_at
 * @property {number | null} score
 * @property {number} max_marks
 * @property {number | null} percentage
 * @property {string | null} letter_grade
 * @property {string | null} band
 * @property {'DRAFT' | 'RELEASED' | null} grade_release_status
 * @property {string | null} released_at
 * @property {number | null} released_score
 * @property {boolean} changed_since_release
 * @property {string | null} graded_at
 */
/**
 * @typedef {object} ResultCounts
 * @property {number} enrolled
 * @property {number} submitted
 * @property {number} graded
 * @property {number} ungraded
 * @property {number} not_yet_due
 * @property {number} missing
 * @property {number} released
 * @property {number} withdrawn_submitted
 */

/** Every learner's result and the counts, for the course's lecturers and administrators. @param {string} assignmentId */
export async function fetchAssignmentResults(assignmentId) {
  const supabase = getSupabase();
  const [rows, counts] = await Promise.all([
    supabase.rpc('assignment_results', { p_assignment: assignmentId }),
    supabase.rpc('assignment_result_counts', { p_assignment: assignmentId }),
  ]);
  if (rows.error) throw rows.error;
  if (counts.error) throw counts.error;
  return {
    rows: /** @type {ResultRow[]} */ (rows.data ?? []),
    counts: /** @type {ResultCounts | null} */ ((counts.data ?? [])[0] ?? null),
  };
}

/**
 * Saves a grade (a draft until released). A released grade changes only with a reason.
 * @param {{ assignmentId: string, learnerId: string, score: number, feedback: string, reason?: string }} grade
 * @returns {Promise<{ submissionId: string, changed: boolean, gradeReleaseStatus: 'DRAFT' | 'RELEASED' }>}
 */
export function saveGrade({ assignmentId, learnerId, score, feedback, reason }) {
  return callFunction('grade-submission', { action: 'save', assignmentId, learnerId, score, feedback, ...(reason ? { reason } : {}) });
}

/** Reopens a graded answer with a reason (owner decision 3). @param {{ assignmentId: string, learnerId: string, reason: string }} r */
export function reopenGrade({ assignmentId, learnerId, reason }) {
  return callFunction('grade-submission', { action: 'reopen', assignmentId, learnerId, reason });
}

/**
 * Releases one learner's draft grade, or every draft grade of the assignment. Returns how many.
 * @param {{ assignmentId: string, learnerId?: string }} r
 * @returns {Promise<{ released: number }>}
 */
export function releaseGrades({ assignmentId, learnerId }) {
  return callFunction('release-grades', { assignmentId, ...(learnerId ? { learnerId } : {}) });
}

/**
 * @typedef {object} MyGrade
 * @property {number} score
 * @property {number} max_marks
 * @property {number} percentage
 * @property {string | null} letter_grade
 * @property {string | null} band
 * @property {boolean} passed
 * @property {string | null} feedback
 * @property {string} released_at
 * @property {boolean} updated
 */

/** The signed-in learner's released grade for an assignment, or null before release. @param {string} assignmentId */
export async function fetchMyGrade(assignmentId) {
  const { data, error } = await getSupabase().rpc('my_grade', { p_assignment: assignmentId });
  if (error) throw error;
  return /** @type {MyGrade | null} */ (data);
}

/**
 * @typedef {object} GradeNotification
 * @property {string} id
 * @property {'GRADE_RELEASED' | 'GRADE_UPDATED'} notification_type
 * @property {string} title
 * @property {string} message
 * @property {string | null} related_entity_id
 * @property {string | null} link_path
 * @property {string} created_at
 */

/** The signed-in user's unread grade notifications, newest first (owner decision 1). */
export async function fetchUnreadGradeNotifications() {
  const { data, error } = await getSupabase()
    .from('notifications')
    .select('id, notification_type, title, message, related_entity_id, link_path, created_at')
    .in('notification_type', ['GRADE_RELEASED', 'GRADE_UPDATED'])
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return /** @type {GradeNotification[]} */ (data ?? []);
}

/** Marks the signed-in user's unread grade notifications for an assignment as read. @param {string} assignmentId */
export async function markGradeNotificationsRead(assignmentId) {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('related_entity_id', assignmentId)
    .in('notification_type', ['GRADE_RELEASED', 'GRADE_UPDATED'])
    .is('read_at', null);
  if (error) throw error;
}

/**
 * The grade's state for a chip (never colour alone: the label says it). Labels only; no figures.
 * @param {{ status: 'SUBMITTED' | 'GRADED' | 'REOPENED' | null, score: number | null, grade_release_status: 'DRAFT' | 'RELEASED' | null,
 *   released_at: string | null, changed_since_release: boolean }} g
 * @returns {{ label: string, tone: 'neutral' | 'info' | 'success' | 'warning' }}
 */
export function gradeState(g) {
  if (g.status === 'REOPENED') return { label: 'Reopened', tone: 'warning' };
  if (g.status !== 'GRADED' || !isSet(g.score)) return { label: 'Ungraded', tone: 'neutral' };
  if (g.grade_release_status === 'RELEASED') return { label: 'Released', tone: 'success' };
  if (g.released_at && g.changed_since_release) return { label: 'Changed, not released', tone: 'warning' };
  return { label: 'Draft grade', tone: 'warning' };
}

/** "15.5 / 20" with no trailing zeros. @param {number | null | undefined} score @param {number} max */
export function formatScore(score, max) {
  return !isSet(score) ? '—' : `${trimNumber(score)} / ${trimNumber(max)}`;
}

/** 77.5 → "77.5%", 80 → "80%". @param {number | null | undefined} percentage */
export function formatPercentage(percentage) {
  return !isSet(percentage) ? '' : `${trimNumber(percentage)}%`;
}

/** @param {number} n */
function trimNumber(n) {
  return String(Number(n));
}
