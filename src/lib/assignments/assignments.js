import { callFunction } from '@/lib/functions.js';
import { getSupabase } from '@/lib/supabase.js';

// Assignment data (Phase 7). Reads go through RLS: a course's lecturers and administrators see all
// of its assignments (drafts and archived included); learners only published, current assignments
// of courses they are enrolled in. Saving, publishing, archiving and categories go through
// manage-assignments; instruction audio through the D18 pipeline (src/lib/uploads.js).

/** @typedef {'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO'} ContentType */
/** @typedef {'TEXT' | 'AUDIO' | 'PDF' | 'DOCX'} AnswerFormat */
/**
 * @typedef {object} Assignment
 * @property {string} id
 * @property {string} course_id
 * @property {string | null} lesson_id
 * @property {string} category_id
 * @property {string} title
 * @property {string} description
 * @property {ContentType} content_type
 * @property {string} text_instructions
 * @property {string | null} instruction_audio_file_id
 * @property {string} due_at
 * @property {boolean} allow_late
 * @property {number} max_marks
 * @property {AnswerFormat[]} accepted_formats
 * @property {string} grading_criteria
 * @property {'DRAFT' | 'PUBLISHED'} publication_status
 * @property {string | null} published_at
 * @property {string | null} archived_at
 */
/** @typedef {{ id: string, name: string, weight: number, position: number }} Category */
/**
 * @typedef {object} InstructionAudio
 * @property {string} file_object_id
 * @property {string} bucket_name
 * @property {string} storage_path
 * @property {string} safe_download_filename
 * @property {string | null} mime_type
 * @property {number | null} file_size
 * @property {number | null} duration_seconds
 * @property {number[] | null} waveform_peaks
 */

export const CONTENT_TYPE_LABEL = /** @type {const} */ ({ TEXT: 'Text', AUDIO: 'Audio', TEXT_AND_AUDIO: 'Text and audio' });
export const FORMAT_LABEL = /** @type {const} */ ({ TEXT: 'Text', AUDIO: 'Audio (recorded or uploaded)', PDF: 'PDF', DOCX: 'Word' });

const DETAIL =
  'id, course_id, lesson_id, category_id, title, description, content_type, text_instructions, instruction_audio_file_id, due_at, allow_late, max_marks, accepted_formats, grading_criteria, publication_status, published_at, archived_at';

/** The course's current categories, in order. @param {string} courseId @returns {Promise<Category[]>} */
export async function fetchCategories(courseId) {
  const { data, error } = await getSupabase()
    .from('grade_categories')
    .select('id, name, weight, position')
    .eq('course_id', courseId)
    .is('archived_at', null)
    .order('position');
  if (error) throw error;
  return /** @type {Category[]} */ (data ?? []);
}

/**
 * @param {string} courseId
 * @param {Array<{ id?: string, name: string, weight: number }>} categories the full list, in order
 * @returns {Promise<{ total: number, ready: boolean }>}
 */
export async function saveCategories(courseId, categories) {
  return /** @type {{ total: number, ready: boolean }} */ (await callFunction('manage-assignments', { action: 'save-categories', courseId, categories }));
}

/**
 * A course's assignments for its lecturers and administrators, by due date.
 * @param {string} courseId
 * @returns {Promise<Array<Pick<Assignment, 'id' | 'title' | 'content_type' | 'due_at' | 'publication_status' | 'archived_at'> & { lesson: { title: string } | null }>>}
 */
export async function fetchCourseAssignments(courseId) {
  const { data, error } = await getSupabase()
    .from('assignments')
    .select('id, title, content_type, due_at, publication_status, archived_at, lesson:lessons(title)')
    .eq('course_id', courseId)
    .order('due_at');
  if (error) throw error;
  return /** @type {any} */ (data ?? []);
}

/** @param {string} id @returns {Promise<Assignment | null>} */
export async function fetchAssignment(id) {
  const { data, error } = await getSupabase().from('assignments').select(DETAIL).eq('id', id).maybeSingle();
  if (error) throw error;
  return /** @type {Assignment | null} */ (/** @type {unknown} */ (data));
}

/** The current instruction audio, for whoever may see the assignment. @param {string} id @returns {Promise<InstructionAudio | null>} */
export async function fetchInstructionAudio(id) {
  const { data, error } = await getSupabase().rpc('assignment_media', { p_assignment: id });
  if (error) throw error;
  return /** @type {InstructionAudio[]} */ (data ?? [])[0] ?? null;
}

/**
 * @param {{ courseId: string, assignmentId?: string, reason?: string, fields: {
 *   title: string, description: string, lessonId: string | null, categoryId: string, contentType: ContentType,
 *   textInstructions: string, dueAt: string, allowLate: boolean, maxMarks: number, acceptedFormats: AnswerFormat[], gradingCriteria: string } }} input
 * @returns {Promise<{ assignmentId: string, textInstructions: string }>} the saved (cleaned) instructions
 */
export async function saveAssignment({ courseId, assignmentId, reason, fields }) {
  return /** @type {{ assignmentId: string, textInstructions: string }} */ (
    await callFunction('manage-assignments', { action: 'save', courseId, assignmentId, reason: reason || undefined, fields })
  );
}

/** @param {string} id @param {boolean} publish @returns {Promise<'DRAFT' | 'PUBLISHED'>} */
export async function setAssignmentPublished(id, publish) {
  const res = /** @type {{ assignment: { status: 'DRAFT' | 'PUBLISHED' } }} */ (
    await callFunction('manage-assignments', { action: 'publish', assignmentId: id, publish })
  );
  return res.assignment.status;
}

/** @param {string} id @param {boolean} archived */
export async function setAssignmentArchived(id, archived) {
  await callFunction('manage-assignments', { action: 'archive', assignmentId: id, archived });
}

/**
 * The signed-in learner's assignments across their courses, each with their own extension (D13) and,
 * since Phase 8, their own submission (sent answers only; a draft is not an answer).
 * @returns {Promise<Array<Pick<Assignment, 'id' | 'course_id' | 'title' | 'content_type' | 'due_at' | 'allow_late'> & { course: { title: string, course_code: string } | null, extended_to: string | null, submission: { status: string, current_version: number, is_late: boolean } | null }>>}
 */
export async function fetchMyAssignments() {
  const supabase = getSupabase();
  const [assignments, extensions, submissions] = await Promise.all([
    supabase.from('assignments').select('id, course_id, title, content_type, due_at, allow_late, course:courses(title, course_code)').order('due_at'),
    supabase.from('submission_extensions').select('assignment_id, extended_due_at'),
    supabase.from('submissions').select('assignment_id, status, current_version, is_late').neq('status', 'DRAFT'),
  ]);
  if (assignments.error) throw assignments.error;
  if (extensions.error) throw extensions.error;
  if (submissions.error) throw submissions.error;
  const extended = new Map((extensions.data ?? []).map((x) => [x.assignment_id, x.extended_due_at]));
  const sent = new Map((submissions.data ?? []).map((s) => [s.assignment_id, s]));
  return /** @type {any[]} */ (assignments.data ?? []).map((a) => ({ ...a, extended_to: extended.get(a.id) ?? null, submission: sent.get(a.id) ?? null }));
}

/**
 * Every assignment, for the administrators' oversight page (newest due first).
 * @returns {Promise<Array<Pick<Assignment, 'id' | 'course_id' | 'title' | 'due_at' | 'publication_status' | 'archived_at'> & { course: { title: string, course_code: string } | null }>>}
 */
export async function fetchAllAssignments() {
  const { data, error } = await getSupabase()
    .from('assignments')
    .select('id, course_id, title, due_at, publication_status, archived_at, course:courses(title, course_code)')
    .order('due_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return /** @type {any} */ (data ?? []);
}
