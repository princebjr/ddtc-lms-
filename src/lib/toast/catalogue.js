// The complete and only list of toasts (docs/UI_FEEDBACK.md, BUILD_PLAN Section 16, D37).
// The toast controller accepts only these ids, so an unlisted toast cannot be shown.
// Adding an entry needs an ADR in docs/DECISIONS.md.

/** @typedef {'success' | 'info' | 'warning' | 'error'} ToastType */

/**
 * @typedef {object} ToastDefinition
 * @property {ToastType} type
 * @property {(params: Record<string, string | number>) => string} text
 * @property {string} [action] label of the single button on the toast
 * @property {boolean} [undo] reversible action: 6-second toast with Undo
 * @property {boolean} [sticky] stays until the condition ends or the user acts
 * @property {readonly string[]} [params] required parameters
 */

/** @param {string} s */
const fixed = (s) => () => s;

/** @param {Record<string, string | number>} p @param {string} k */
const str = (p, k) => String(p[k]);

/** @type {Readonly<Record<string, Readonly<ToastDefinition>>>} */
export const TOASTS = Object.freeze({
  // Everyone
  'profile.saved': { type: 'success', text: fixed('Profile saved') },
  'profile.photo-updated': { type: 'success', text: fixed('Photo updated') },
  'profile.photo-rejected': { type: 'error', text: (p) => `Photo not accepted: ${str(p, 'reason')}`, action: 'Try again', params: ['reason'] },
  'account.password-changed': { type: 'success', text: fixed('Password changed') },
  'account.verification-resent': { type: 'success', text: fixed('Verification email sent') },
  'account.signed-out': { type: 'info', text: fixed('You have signed out') },
  'network.offline': { type: 'warning', text: fixed('You are offline'), sticky: true },
  'network.online': { type: 'success', text: fixed('Back online') },
  'notification.new': { type: 'info', text: (p) => str(p, 'title'), action: 'Open', params: ['title'] },
  'app.update-ready': { type: 'info', text: fixed('New version available'), action: 'Refresh', sticky: true },
  'session.expiring': { type: 'warning', text: fixed('Your session ends in 2 minutes'), action: 'Stay signed in' },
  'request.failed': { type: 'error', text: fixed('Could not save. Try again'), action: 'Retry' },

  // Administrator
  'admin.learner-added': { type: 'success', text: fixed('Learner added') },
  'admin.lecturer-invited': { type: 'success', text: fixed('Lecturer invited') },
  'admin.administrator-invited': { type: 'success', text: fixed('Administrator invited') },
  'admin.csv-imported': { type: 'success', text: (p) => `Imported ${str(p, 'n')} learners, ${str(p, 'm')} errors`, action: 'View report', params: ['n', 'm'] },
  'admin.csv-imported-with-errors': { type: 'warning', text: (p) => `Imported ${str(p, 'n')} learners, ${str(p, 'm')} errors`, action: 'View report', params: ['n', 'm'] },
  'admin.permissions-updated': { type: 'success', text: fixed('Permissions updated') },
  'admin.account-suspended': { type: 'success', text: fixed('Account suspended'), undo: true },
  'admin.account-reactivated': { type: 'success', text: fixed('Account reactivated'), undo: true },
  'admin.mfa-reset': { type: 'success', text: (p) => `MFA reset for ${str(p, 'name')}`, params: ['name'] },
  'admin.course-approved': { type: 'success', text: fixed('Course approved and published') },
  'admin.course-returned': { type: 'success', text: fixed('Course returned to lecturer') },
  'admin.course-archived': { type: 'success', text: fixed('Course archived'), undo: true },
  'admin.learners-enrolled': { type: 'success', text: (p) => `${str(p, 'n')} learners enrolled`, undo: true, params: ['n'] },
  'admin.enrolment-updated': { type: 'success', text: fixed('Enrolment updated'), undo: true },
  'admin.owner-changed': { type: 'success', text: fixed('Owner changed') },
  'admin.setting-saved': { type: 'success', text: fixed('Setting saved') },
  'admin.hold-placed': { type: 'success', text: fixed('Hold placed'), undo: true },
  'admin.hold-released': { type: 'success', text: fixed('Hold released'), undo: true },
  'admin.retention-enabled': { type: 'warning', text: fixed('Retention enabled') },
  'admin.retention-disabled': { type: 'warning', text: fixed('Retention disabled') },
  'admin.export-ready': { type: 'success', text: fixed('Export ready'), action: 'Download' },

  // Lecturer
  'lecturer.draft-saved': { type: 'success', text: fixed('Draft saved') },
  'lecturer.submitted-for-approval': { type: 'success', text: fixed('Submitted for approval') },
  'lecturer.course-published': { type: 'success', text: fixed('Course published') },
  'lecturer.co-lecturer-added': { type: 'success', text: fixed('Co-lecturer added'), undo: true },
  'lecturer.co-lecturer-removed': { type: 'success', text: fixed('Co-lecturer removed'), undo: true },
  'lecturer.lesson-saved': { type: 'success', text: fixed('Lesson saved') },
  'lecturer.lesson-published': { type: 'success', text: fixed('Lesson published'), undo: true },
  'lecturer.lesson-unpublished': { type: 'success', text: fixed('Lesson unpublished'), undo: true },
  'lecturer.order-saved': { type: 'success', text: fixed('Order saved'), undo: true },
  'lecturer.audio-ready': { type: 'success', text: fixed('Audio ready') },
  'lecturer.audio-rejected': { type: 'error', text: (p) => `Audio rejected: ${str(p, 'reason')}`, action: 'Try again', params: ['reason'] },
  'lecturer.audio-replaced': { type: 'success', text: fixed('Audio replaced') },
  'lecturer.attachment-added': { type: 'success', text: fixed('Attachment added') },
  'lecturer.audio-deleted': { type: 'success', text: fixed('Audio deleted') },
  'lecturer.attachment-deleted': { type: 'success', text: fixed('Attachment deleted') },
  'lecturer.cover-removed': { type: 'success', text: fixed('Cover image removed') },
  'lecturer.delete-failed': { type: 'error', text: (p) => `Could not delete: ${str(p, 'reason')}`, action: 'Try again', params: ['reason'] },
  'lecturer.assignment-saved': { type: 'success', text: fixed('Assignment saved') },
  'lecturer.assignment-published': { type: 'success', text: fixed('Assignment published') },
  'lecturer.extension-granted': { type: 'success', text: fixed('Extension granted'), undo: true },
  'lecturer.grade-draft-saved': { type: 'success', text: fixed('Grade saved as draft') },
  'lecturer.grades-released': { type: 'success', text: (p) => `Grades released to ${str(p, 'n')} learners`, params: ['n'] },
  'lecturer.score-out-of-range': { type: 'error', text: fixed('Score must be between 0 and maximum') },
  'lecturer.submission-reopened': { type: 'success', text: fixed('Submission reopened') },
  'lecturer.gradebook-export-ready': { type: 'success', text: fixed('Export ready'), action: 'Download' },

  // Learner
  'learner.lesson-completed': { type: 'success', text: fixed('Lesson completed'), undo: true },
  'learner.lesson-not-complete': { type: 'success', text: fixed('Marked not complete'), undo: true },
  'learner.audio-download': { type: 'info', text: (p) => `Downloading audio (${str(p, 'size')})`, params: ['size'] },
  'learner.recording-saved': { type: 'success', text: fixed('Recording saved') },
  'learner.recording-discarded': { type: 'success', text: fixed('Recording discarded') },
  'learner.microphone-blocked': { type: 'warning', text: fixed('Microphone blocked. Upload a file instead'), action: 'Upload file' },
  'learner.submission-received': { type: 'success', text: fixed('Submission received') },
  'learner.submitted-late': { type: 'warning', text: fixed('Submitted late') },
  'learner.resubmitted': { type: 'success', text: (p) => `Resubmitted as version ${str(p, 'n')}`, params: ['n'] },
  'learner.file-rejected': { type: 'error', text: (p) => `File not accepted: ${str(p, 'reason')}`, action: 'Try again', params: ['reason'] },
  'learner.upload-resumed': { type: 'info', text: fixed('Upload resumed') },
  'learner.grade-released': { type: 'info', text: fixed('New grade available'), action: 'View' },
});

/** @typedef {keyof typeof TOASTS} ToastId */

/** Section 16 durations in milliseconds. `Infinity` means it stays until dismissed. */
export const TOAST_DURATIONS = Object.freeze({
  success: 4000,
  info: 5000,
  warning: 8000,
  error: Number.POSITIVE_INFINITY,
  undo: 6000,
});

/** At most this many toasts are visible at once. */
export const MAX_VISIBLE_TOASTS = 3;

/**
 * @param {Readonly<ToastDefinition>} def
 * @returns {number}
 */
export function durationFor(def) {
  if (def.sticky) return Number.POSITIVE_INFINITY;
  if (def.undo) return TOAST_DURATIONS.undo;
  return TOAST_DURATIONS[def.type];
}
