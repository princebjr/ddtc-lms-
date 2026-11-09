import { callFunction } from '@/lib/functions.js';
import { getSupabase } from '@/lib/supabase.js';

// Learners' answers (Phase 8; D10, D13, ADR-009, owner decisions of 2026-11-08). Everything that
// depends on time is decided on the server (D24): the learner's page reads my_submission(), which
// says whether an answer may be sent now and whether it would be late; submit-assignment sends it.
// Lecturers and administrators read assignment_submissions() and submission_review(); extensions go
// through manage-assignments. Files go through the D18 pipeline (src/lib/uploads.js).

/** Plain text (owner decision 2), counted as the database counts it. */
export const MAX_TEXT_ANSWER = 20000;

/**
 * @typedef {object} AnswerFile
 * @property {string} id
 * @property {string} original_filename
 * @property {string} safe_download_filename
 * @property {string | null} mime_type
 * @property {number | null} file_size
 * @property {number | null} duration_seconds
 * @property {number[] | null} waveform_peaks
 * @property {'PENDING' | 'VALIDATED' | 'REJECTED' | 'DELETED' | 'DELETE_FAILED'} status
 * @property {string | null} validation_error
 * @property {string} bucket_name
 * @property {string} storage_path
 * @property {'AUDIO' | 'PDF' | 'DOCX' | 'OTHER' | null} file_role
 * @property {string} uploaded_at
 */
/**
 * @typedef {object} AnswerVersion
 * @property {string} id
 * @property {number} version_number
 * @property {string} submitted_at
 * @property {boolean} is_late
 * @property {string} text_answer
 * @property {AnswerFile[]} files
 */
/** @typedef {'not_found' | 'not_allowed' | 'not_enrolled' | 'read_only' | 'not_open' | 'graded' | 'past_due' | 'past_due_resubmit'} BlockedReason */
/**
 * @typedef {object} MySubmission
 * @property {string} assignment_id
 * @property {string} due_at
 * @property {string} effective_due_at
 * @property {boolean} extended
 * @property {boolean} allow_late
 * @property {Array<'TEXT' | 'AUDIO' | 'PDF' | 'DOCX'>} accepted_formats
 * @property {number} max_files
 * @property {string | null} submission_id
 * @property {'DRAFT' | 'SUBMITTED' | 'GRADED' | 'REOPENED' | null} status
 * @property {number} current_version
 * @property {number} next_version
 * @property {boolean} is_late
 * @property {boolean} can_submit
 * @property {boolean} will_be_late
 * @property {BlockedReason | null} blocked_reason
 * @property {AnswerFile[]} draft_files
 * @property {AnswerVersion[]} versions
 */

/** The learner's own state for an assignment, or null when they cannot see it. @param {string} assignmentId */
export async function fetchMySubmission(assignmentId) {
  const { data, error } = await getSupabase().rpc('my_submission', {
    p_assignment: assignmentId,
  });
  if (error) throw error;
  return /** @type {MySubmission | null} */ (data);
}

/**
 * Sends the answer as the next version. A retry with the same requestId returns the first result.
 * @param {{ assignmentId: string, text: string, fileIds: string[], requestId: string }} answer
 * @returns {Promise<{ submissionId: string, versionNumber: number, isLate: boolean, resubmitted: boolean, replayed: boolean }>}
 */
export function submitAnswer({ assignmentId, text, fileIds, requestId }) {
  return callFunction('submit-assignment', {
    action: 'submit',
    assignmentId,
    text,
    fileIds,
    requestId,
  });
}

/** Removes an upload that has not been sent (owner decision 4). @param {string} fileId */
export function removeDraftFile(fileId) {
  return callFunction('submit-assignment', { action: 'remove-file', fileId });
}

/** What the learner is told when they cannot send an answer now. @param {BlockedReason | null | undefined} reason */
export function blockedMessage(reason) {
  switch (reason) {
    case 'read_only':
      return 'This course is read-only for you, so answers can no longer be sent.';
    case 'not_open':
      return 'This assignment is not open for answers.';
    case 'graded':
      return 'Your answer has been graded, so it cannot be sent again.';
    case 'past_due':
      return 'The due date has passed and this assignment does not accept late answers.';
    case 'past_due_resubmit':
      return 'The due date has passed. Your last answer is the one that will be graded.';
    case 'not_enrolled':
    case 'not_allowed':
      return 'You cannot send an answer to this assignment.';
    default:
      return '';
  }
}

/**
 * @typedef {object} SubmissionRow
 * @property {string} learner_id
 * @property {string} first_name
 * @property {string} second_name
 * @property {number | null} id_number
 * @property {string | null} branch_name
 * @property {string | null} profile_image_path
 * @property {'ACTIVE' | 'COMPLETED' | 'WITHDRAWN' | 'SUSPENDED'} enrolment_status
 * @property {string | null} submission_id
 * @property {'SUBMITTED' | 'GRADED' | 'REOPENED' | null} status
 * @property {number | null} current_version
 * @property {string | null} submitted_at
 * @property {boolean | null} is_late
 * @property {string | null} extended_due_at
 * @property {string} effective_due_at
 */

/** Every learner of the assignment's course with their submission (lecturers and administrators). @param {string} assignmentId */
export async function fetchAssignmentSubmissions(assignmentId) {
  const { data, error } = await getSupabase().rpc('assignment_submissions', {
    p_assignment: assignmentId,
  });
  if (error) throw error;
  return /** @type {SubmissionRow[]} */ (data ?? []);
}

/**
 * @typedef {object} SubmissionReview
 * @property {{ id: string, first_name: string, second_name: string, id_number: number | null, branch_name: string | null, profile_image_path: string | null }} learner
 * @property {string} due_at
 * @property {string | null} extended_due_at
 * @property {string | null} extension_reason
 * @property {string} effective_due_at
 * @property {'SUBMITTED' | 'GRADED' | 'REOPENED' | null} status
 * @property {number} current_version
 * @property {boolean} is_late
 * @property {AnswerVersion[]} versions
 */

/** One learner's answer with every version (lecturers and administrators). @param {string} assignmentId @param {string} learnerId */
export async function fetchSubmissionReview(assignmentId, learnerId) {
  const { data, error } = await getSupabase().rpc('submission_review', {
    p_assignment: assignmentId,
    p_learner: learnerId,
  });
  if (error) throw error;
  return /** @type {SubmissionReview | null} */ (data);
}

/**
 * Sets or changes one learner's extension; `undo` restores a previous date. Returns the previous date.
 * @param {{ assignmentId: string, learnerId: string, extendedDueAt: string, reason?: string, undo?: boolean }} extension
 * @returns {Promise<{ previous: string | null }>}
 */
export function setExtension({ assignmentId, learnerId, extendedDueAt, reason, undo = false }) {
  return callFunction('manage-assignments', {
    action: 'extension-set',
    assignmentId,
    learnerId,
    extendedDueAt,
    reason,
    undo,
  });
}

/** Takes a learner's extension back (kept, marked). Returns its date. @param {string} assignmentId @param {string} learnerId */
export function removeExtension(assignmentId, learnerId) {
  return /** @type {Promise<{ removed: string }>} */ (
    callFunction('manage-assignments', {
      action: 'extension-remove',
      assignmentId,
      learnerId,
    })
  );
}

/** "Text", "Audio · 3:12", "Text, audio and PDF" for a version's list row. @param {AnswerVersion} v */
export function versionSummary(v) {
  const parts = [];
  if (v.text_answer.trim()) parts.push('text');
  const audio = v.files.filter((f) => f.file_role === 'AUDIO').length;
  if (audio) parts.push(audio === 1 ? 'audio' : `${audio} recordings`);
  if (v.files.some((f) => f.file_role === 'PDF')) parts.push('PDF');
  if (v.files.some((f) => f.file_role === 'DOCX')) parts.push('Word');
  if (!parts.length) return 'Answer';
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
