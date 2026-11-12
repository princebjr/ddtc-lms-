import { callFunction } from '@/lib/functions.js';
import { getStorage, signedUrl } from '@/lib/storage.js';
import { getSupabase } from '@/lib/supabase.js';

// End-of-course examinations (Phase 10.1; ADR-016; owner request and answers of 2026-11-10). The
// database holds every rule (who may set, take and mark, the deadline in its own time, marking bounds,
// what learners may read); this file fetches, labels and calls the Edge Functions. There is no countdown
// timer anywhere: an examination shows only when it opens and closes.

/** @typedef {'MCQ' | 'SHORT' | 'ESSAY'} QuestionKind */
/** @typedef {'UPCOMING' | 'OPEN' | 'IN_PROGRESS' | 'SUBMITTED' | 'NOT_SUBMITTED' | 'CLOSED'} LearnerExamState */
/** @typedef {'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'NOT_SUBMITTED'} ResultState */

/**
 * @typedef {object} ExamRow  an examination as the course's managers read it
 * @property {string} id
 * @property {string} course_id
 * @property {string} title
 * @property {string} description
 * @property {string} instructions
 * @property {number} pass_mark
 * @property {string} opens_at
 * @property {string} closes_at
 * @property {string | null} closed_at
 * @property {'DRAFT' | 'PUBLISHED'} publication_status
 * @property {string | null} archived_at
 * @property {QuestionKind[]} [modes]  the types of question the lecturer chose (Step 11.2, ADR-021)
 */
/**
 * @typedef {object} EditorQuestion
 * @property {QuestionKind} kind
 * @property {string} prompt
 * @property {string} marks  as typed
 * @property {{ A: string, B: string, C: string, D: string }} options
 * @property {'' | 'A' | 'B' | 'C' | 'D'} correct
 * @property {string} guide
 */
/**
 * A section in the editor. mode is its one type of question (Step 11.2, ADR-021); null only for a section
 * set before that step whose questions are of more than one kind, until the lecturer splits it.
 * @typedef {{ title: string, instructions: string, mode: QuestionKind | null, questions: EditorQuestion[] }} EditorSection
 */

/** The types of question, in their usual order. */
export const EXAM_MODES = /** @type {const} */ (['MCQ', 'SHORT', 'ESSAY']);
/** @type {Readonly<Record<QuestionKind, string>>} */
export const MODE_LABEL = Object.freeze({ MCQ: 'Multiple choice', SHORT: 'Short answer', ESSAY: 'Essay' });

/** The one kind all these questions share, or null (none, or more than one kind). @param {Array<{ kind: QuestionKind }>} questions @returns {QuestionKind | null} */
export function singleKind(questions) {
  const kinds = new Set(questions.map((q) => q.kind));
  return kinds.size === 1 ? /** @type {QuestionKind} */ ([...kinds][0]) : null;
}

const EXAM_FIELDS = 'id, course_id, title, description, instructions, pass_mark, opens_at, closes_at, closed_at, publication_status, archived_at, modes';

/** A course's examinations for its managers (RLS), newest opening first. @param {string} courseId */
export async function fetchCourseExams(courseId) {
  const { data, error } = await getSupabase().from('examinations').select(EXAM_FIELDS).eq('course_id', courseId).order('opens_at', { ascending: false });
  if (error) throw error;
  return /** @type {ExamRow[]} */ (data ?? []);
}

/**
 * One examination with its sections and questions (answer keys included) for its managers, and whether
 * a learner has started it (then only the deadline changes).
 * @param {string} examId
 * @returns {Promise<{ exam: ExamRow | null, sections: EditorSection[], started: boolean }>}
 */
export async function fetchExamForEditing(examId) {
  const supabase = getSupabase();
  const [exam, sections, questions, attempts] = await Promise.all([
    supabase.from('examinations').select(EXAM_FIELDS).eq('id', examId).maybeSingle(),
    supabase.from('exam_sections').select('id, title, instructions, position, mode').eq('exam_id', examId).is('archived_at', null).order('position'),
    supabase
      .from('exam_questions')
      .select('id, section_id, kind, prompt, option_a, option_b, option_c, option_d, marks, position, exam_question_keys(correct_option, marking_guide)')
      .eq('exam_id', examId)
      .is('archived_at', null)
      .order('position'),
    supabase.from('exam_attempts').select('id', { count: 'exact', head: true }).eq('exam_id', examId).neq('status', 'NOT_STARTED'),
  ]);
  for (const r of [exam, sections, questions, attempts]) if (r.error) throw r.error;
  return {
    exam: /** @type {ExamRow | null} */ (exam.data),
    started: (attempts.count ?? 0) > 0,
    sections: (sections.data ?? []).map((/** @type {any} */ s) => {
      /** @type {EditorQuestion[]} */
      const own = (questions.data ?? [])
        .filter((q) => q.section_id === s.id)
        .map((/** @type {any} */ q) => {
          const key = Array.isArray(q.exam_question_keys) ? q.exam_question_keys[0] : q.exam_question_keys;
          return {
            kind: q.kind,
            prompt: q.prompt,
            marks: String(Number(q.marks)),
            options: { A: q.option_a ?? '', B: q.option_b ?? '', C: q.option_c ?? '', D: q.option_d ?? '' },
            correct: key?.correct_option ?? '',
            guide: key?.marking_guide ?? '',
          };
        });
      return { title: s.title, instructions: s.instructions, mode: /** @type {QuestionKind | null} */ (s.mode ?? singleKind(own)), questions: own };
    }),
  };
}

/**
 * Creates or updates the examination's details. Times are ISO strings.
 * @param {{ courseId: string, examId?: string, fields: { title: string, description: string, instructions: string, pass_mark: number, opens_at: string, closes_at: string, modes?: QuestionKind[] } }} r
 * @returns {Promise<{ examId: string }>}
 */
export function saveExam({ courseId, examId, fields }) {
  return callFunction('manage-examinations', { action: 'save', courseId, ...(examId ? { examId } : {}), fields });
}

/** @param {string} examId @param {EditorSection[]} sections @returns {Promise<{ questions: number }>} */
export function saveExamStructure(examId, sections) {
  return callFunction('manage-examinations', {
    action: 'structure',
    examId,
    sections: sections.map((s) => ({
      title: s.title,
      instructions: s.instructions,
      ...(s.mode ? { mode: s.mode } : {}),
      questions: s.questions.map((q) =>
        q.kind === 'MCQ'
          ? { kind: 'MCQ', prompt: q.prompt, marks: Number(q.marks), options: q.options, ...(q.correct ? { correct: q.correct } : {}) }
          : { kind: q.kind, prompt: q.prompt, marks: Number(q.marks), guide: q.guide },
      ),
    })),
  });
}

/** @param {string} examId @param {boolean} publish */
export const publishExam = (examId, publish) => callFunction('manage-examinations', { action: 'publish', examId, publish });
/** @param {string} examId @param {boolean} archived */
export const archiveExam = (examId, archived) => callFunction('manage-examinations', { action: 'archive', examId, archived });
/** @param {string} examId @param {string} closesAt @param {string} [reason] */
export const setExamDeadline = (examId, closesAt, reason) =>
  callFunction('manage-examinations', { action: 'deadline', examId, closesAt, ...(reason ? { reason } : {}) });
/** @param {string} examId @param {string} [reason] */
export const closeExam = (examId, reason) => callFunction('manage-examinations', { action: 'close', examId, ...(reason ? { reason } : {}) });
/** @param {string} examId @param {string} learnerId @param {string} closesAt @param {string} [reason] */
export const setExamExtension = (examId, learnerId, closesAt, reason) =>
  callFunction('manage-examinations', { action: 'extension-set', examId, learnerId, closesAt, ...(reason ? { reason } : {}) });

/**
 * @typedef {object} ExamResult  one learner's standing (exam_results)
 * @property {string} learner_id
 * @property {string} first_name
 * @property {string} second_name
 * @property {number | null} id_number
 * @property {string | null} branch_name
 * @property {string | null} profile_image_path
 * @property {number | null} attempt_number
 * @property {ResultState} state
 * @property {string | null} submitted_at
 * @property {string} closes_at
 * @property {number | null} mcq_score
 * @property {number | null} short_score
 * @property {number | null} essay_score
 * @property {number | null} total_score
 * @property {number} total_marks
 * @property {number | null} percentage
 * @property {boolean | null} passed
 * @property {string | null} feedback
 * @property {'UNGRADED' | 'PARTLY' | 'GRADED' | null} grading_state
 * @property {'DRAFT' | 'RELEASED'} grade_release_status
 * @property {string | null} released_at
 * @property {number | null} released_score
 * @property {boolean} changed_since_release
 */

/** Every learner's standing on the examination (the course's managers). @param {string} examId */
export async function fetchExamResults(examId) {
  const { data, error } = await getSupabase().rpc('exam_results', { p_exam: examId });
  if (error) throw error;
  return /** @type {ExamResult[]} */ (data ?? []);
}

/**
 * @typedef {object} ScriptQuestion
 * @property {string} id
 * @property {QuestionKind} kind
 * @property {string} prompt
 * @property {number} marks
 * @property {{ A: string, B: string, C: string, D: string } | null} options
 * @property {string | null} correct_option
 * @property {string} marking_guide
 * @property {{ selected_option: string | null, text_answer: string, score: number | null, auto_marked: boolean, feedback: string | null } | null} answer
 */
/**
 * @typedef {object} Script
 * @property {number} total_marks
 * @property {number} pass_mark
 * @property {{ id: string, attempt_number: number, status: string, submitted_at: string | null, feedback: string | null,
 *   grade_release_status: 'DRAFT' | 'RELEASED', released_at: string | null, released_score: number | null, retake_reason: string | null } | null} attempt
 * @property {Array<{ attempt_number: number, status: string, submitted_at: string | null, released_score: number | null, released_at: string | null, retake_reason: string | null }> | null} attempts
 * @property {Array<{ id: string, title: string, instructions: string, questions: ScriptQuestion[] }> | null} sections
 */

/** One learner's script for marking, with the keys (the course's managers). @param {string} examId @param {string} learnerId */
export async function fetchExamScript(examId, learnerId) {
  const { data, error } = await getSupabase().rpc('exam_script', { p_exam: examId, p_learner: learnerId });
  if (error) throw error;
  return /** @type {Script | null} */ (data);
}

/** A playable link to a recording for whoever may read it (Storage policy; playback expiry D19). @param {string} bucket @param {string} path */
export const audioUrl = (bucket, path) => signedUrl(bucket, path);

/** @param {{ examId: string, learnerId: string, questionId: string, score: number, feedback: string, reason?: string }} r */
export const markExamAnswer = ({ examId, learnerId, questionId, score, feedback, reason }) =>
  callFunction('grade-examination', { action: 'mark', examId, learnerId, questionId, score, feedback, ...(reason ? { reason } : {}) });
/** @param {{ examId: string, learnerId: string, feedback: string, reason?: string }} r */
export const saveExamFeedback = ({ examId, learnerId, feedback, reason }) =>
  callFunction('grade-examination', { action: 'feedback', examId, learnerId, feedback, ...(reason ? { reason } : {}) });
/** @param {string} examId @param {string} [learnerId] @returns {Promise<{ released: number }>} */
export const releaseExam = (examId, learnerId) => callFunction('grade-examination', { action: 'release', examId, ...(learnerId ? { learnerId } : {}) });
/** @param {string} examId @param {string} learnerId @param {string} reason */
export const authoriseRetake = (examId, learnerId, reason) => callFunction('grade-examination', { action: 'retake', examId, learnerId, reason });

// ---------------------------------------------------------------- the learner

/**
 * @typedef {object} MyExamSummary
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} opens_at
 * @property {string} closes_at  their own deadline (with any extension)
 * @property {number} total_marks
 * @property {number} pass_mark
 * @property {LearnerExamState} state
 * @property {number | null} attempt_number
 * @property {string | null} submitted_at
 * @property {boolean} released
 * @property {number | null} total_score
 * @property {number | null} percentage
 * @property {boolean | null} passed
 */

/** The signed-in learner's examinations in a course. @param {string} courseId */
export async function fetchMyExams(courseId) {
  const { data, error } = await getSupabase().rpc('my_exams', { p_course: courseId });
  if (error) throw error;
  return /** @type {MyExamSummary[]} */ (data ?? []);
}

/**
 * @typedef {object} MyExam
 * @property {string} id
 * @property {string} course_id
 * @property {string} title
 * @property {string} description
 * @property {string} instructions
 * @property {string} opens_at
 * @property {string} closes_at
 * @property {number} total_marks
 * @property {number} pass_mark
 * @property {LearnerExamState} state
 * @property {number | null} attempt_number
 * @property {string | null} submitted_at
 * @property {Array<{ id: string, title: string, instructions: string, questions: Array<{ id: string, kind: QuestionKind, prompt: string, marks: number,
 *   options: { A: string, B: string, C: string, D: string } | null,
 *   answer: { selected_option?: string, text_answer?: string, score?: number, feedback?: string } }> }> | null} sections
 * @property {{ attempt_number: number, total_score: number, total_marks: number, percentage: number, letter_grade: string | null, passed: boolean,
 *   feedback: string | null, released_at: string } | null} result
 */

/** One examination for the signed-in learner (no keys or guides; marks once released). @param {string} examId */
export async function fetchMyExam(examId) {
  const { data, error } = await getSupabase().rpc('my_exam', { p_exam: examId });
  if (error) throw error;
  return /** @type {MyExam | null} */ (data);
}

/** @param {string} examId @returns {Promise<{ attemptId: string }>} */
export const startExam = (examId) => callFunction('exam-attempt', { action: 'start', examId });
/**
 * Autosave: only the answers given; audioFileIds is the answer's whole list of recordings, in order (up to 3; empty removes them).
 * @param {string} examId
 * @param {Array<{ questionId: string, selectedOption?: string | null, textAnswer?: string, audioFileIds?: string[], documentFileId?: string | null }>} answers
 * @returns {Promise<{ savedAt: string }>}
 */
export const saveExamAnswers = (examId, answers) => callFunction('exam-attempt', { action: 'save', examId, answers });
/** @param {string} examId @returns {Promise<{ attemptId: string, submittedAt: string }>} */
export const submitExam = (examId) => callFunction('exam-attempt', { action: 'submit', examId });

// ---------------------------------------------------------------- labels (never colour alone)

/** @type {Readonly<Record<LearnerExamState, { label: string, tone: 'success' | 'warning' | 'error' | 'info' | 'neutral' }>>} */
export const LEARNER_STATE = Object.freeze({
  UPCOMING: { label: 'Opens soon', tone: 'neutral' },
  OPEN: { label: 'Open', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  SUBMITTED: { label: 'Submitted', tone: 'success' },
  NOT_SUBMITTED: { label: 'Not submitted', tone: 'error' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
});

/** @type {Readonly<Record<ResultState, { label: string, tone: 'success' | 'warning' | 'error' | 'info' | 'neutral' }>>} */
export const RESULT_STATE = Object.freeze({
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  SUBMITTED: { label: 'Submitted', tone: 'success' },
  NOT_SUBMITTED: { label: 'Not submitted', tone: 'error' },
});

/** The examination's standing for its managers' list (draft, published, closed, archived). @param {ExamRow} x @param {Date} [now] */
export function examStatus(x, now = new Date()) {
  if (x.archived_at) return /** @type {const} */ ({ label: 'Archived', tone: 'neutral' });
  if (x.publication_status !== 'PUBLISHED') return /** @type {const} */ ({ label: 'Draft', tone: 'neutral' });
  const close = Date.parse(x.closed_at ?? x.closes_at);
  if (now.getTime() >= close) return /** @type {const} */ ({ label: 'Closed', tone: 'neutral' });
  if (now.getTime() < Date.parse(x.opens_at)) return /** @type {const} */ ({ label: 'Published, opens later', tone: 'info' });
  return /** @type {const} */ ({ label: 'Open', tone: 'success' });
}

/** The questions' total, as the lecturer builds them (the database adds it up again). @param {EditorSection[]} sections */
export function editorTotal(sections) {
  return sections.reduce((n, s) => n + s.questions.reduce((m, q) => m + (Number.isFinite(Number(q.marks)) ? Number(q.marks) : 0), 0), 0);
}

/** A fresh question of a kind, for the builder. @param {QuestionKind} kind @returns {EditorQuestion} */
export function blankQuestion(kind) {
  return { kind, prompt: '', marks: kind === 'ESSAY' ? '10' : kind === 'SHORT' ? '5' : '1', options: { A: '', B: '', C: '', D: '' }, correct: '', guide: '' };
}

// ---------------------------------------------------------------- dashboards

/**
 * The signed-in learner's examinations still to do across their courses, soonest deadline first.
 * @returns {Promise<Array<{ exam_id: string, title: string, course_id: string, course_title: string, course_code: string, opens_at: string, closes_at: string,
 *   state: 'UPCOMING' | 'OPEN' | 'IN_PROGRESS' }>>}
 */
export async function fetchExamDeadlines() {
  const { data, error } = await getSupabase().rpc('my_exam_deadlines');
  if (error) throw error;
  return /** @type {any} */ (data ?? []);
}

/**
 * Per examination of the courses the caller manages: scripts to mark and results to release.
 * @returns {Promise<Array<{ exam_id: string, title: string, course_id: string, course_title: string, course_code: string, to_mark: number, to_release: number }>>}
 */
export async function fetchExamMarkingQueue() {
  const { data, error } = await getSupabase().rpc('exam_marking_queue');
  if (error) throw error;
  return /** @type {any} */ (data ?? []);
}

// ---------------------------------------------------------------- answer files (Step 10.3)

/**
 * @typedef {object} ExamAnswerFile  a recording (AUDIO: recorded or uploaded) or a document (DOCUMENT: PDF or Word) on an answer
 * @property {string} question_id
 * @property {'AUDIO' | 'DOCUMENT'} kind
 * @property {string} file_id
 * @property {string} bucket
 * @property {string} storage_path
 * @property {string} original_filename
 * @property {string} safe_download_filename
 * @property {number | null} duration_seconds
 * @property {string | null} mime_type
 */

/** The recordings and documents on a learner's latest attempt (the learner themselves or the course's managers). @param {string} examId @param {string} learnerId */
export async function fetchExamFiles(examId, learnerId) {
  const { data, error } = await getSupabase().rpc('exam_answer_files', { p_exam: examId, p_learner: learnerId });
  if (error) throw error;
  return /** @type {ExamAnswerFile[]} */ (data ?? []);
}

/**
 * A short-lived link to an answer document (download expiry D19): to save it under its safe name, or
 * (download false) for the browser to show it, which is how a PDF is opened.
 * @param {ExamAnswerFile} f
 * @param {{ download?: boolean }} [options]
 */
export async function documentUrl(f, { download = true } = {}) {
  const storage = await getStorage();
  const { data, error } = await storage.from(f.bucket).createSignedUrl(f.storage_path, 300, download ? { download: f.safe_download_filename } : undefined);
  if (error || !data?.signedUrl) throw error ?? new Error('link');
  return data.signedUrl;
}
