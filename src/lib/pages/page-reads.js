import { getSupabase } from '@/lib/supabase.js';

// One round trip per learner screen (Phase 15, D45; migration 55). Each read returns what the screen used to
// fetch with 4 to 8 separate calls, in the same shapes, so the screens render exactly as before. The database
// functions run with the caller's rights: the same RLS policies and read functions decide what comes back.

/** @typedef {import('@/lib/courses/courses.js').Course} Course */
/** @typedef {import('@/lib/courses/courses.js').EnrolmentStatus} EnrolmentStatus */
/** @typedef {import('@/lib/lessons/lessons.js').Lesson} Lesson */
/** @typedef {import('@/lib/lessons/lessons.js').LessonSummary} LessonSummary */
/** @typedef {import('@/lib/lessons/lessons.js').LessonMedia} LessonMedia */

/**
 * @param {'get_lesson_page' | 'get_course_page' | 'get_assignment_page'} fn
 * @param {Record<string, string>} args
 */
async function read(fn, args) {
  const { data, error } = await getSupabase().rpc(fn, /** @type {any} */ (args));
  if (error) throw error;
  return /** @type {any} */ (data ?? {});
}

/**
 * The learner's lesson screen: the course, its lessons, the lesson, its audio and attachments, the learner's
 * progress in the course and their enrolment. @param {string} courseId @param {string} lessonId
 */
export async function fetchLessonPage(courseId, lessonId) {
  const d = await read('get_lesson_page', { p_course: courseId, p_lesson: lessonId });
  const media = /** @type {LessonMedia[]} */ (d.media ?? []);
  return {
    course: /** @type {Course | null} */ (d.course ?? null),
    lessons: /** @type {LessonSummary[]} */ (d.lessons ?? []),
    lesson: /** @type {Lesson | null} */ (d.lesson ?? null),
    media: { audios: media.filter((m) => m.kind === 'AUDIO'), attachments: media.filter((m) => m.kind === 'ATTACHMENT') },
    progress: /** @type {Record<string, boolean>} */ (d.progress ?? {}),
    enrolment: /** @type {EnrolmentStatus | null} */ (d.enrolment ?? null),
  };
}

/**
 * The learner's course screen: course, teachers, enrolment, lessons, progress, the course's assignments,
 * examinations and the course grade. @param {string} courseId
 */
export async function fetchCoursePage(courseId) {
  const d = await read('get_course_page', { p_course: courseId });
  return {
    course: /** @type {Course | null} */ (d.course ?? null),
    teachers: /** @type {Awaited<ReturnType<typeof import('@/lib/courses/courses.js').fetchTeachers>>} */ (d.teachers ?? []),
    enrolment: /** @type {EnrolmentStatus | null} */ (d.enrolment ?? null),
    lessons: /** @type {LessonSummary[]} */ (d.lessons ?? []),
    progress: /** @type {Record<string, boolean>} */ (d.progress ?? {}),
    assignments: /** @type {Awaited<ReturnType<typeof import('@/lib/assignments/assignments.js').fetchMyAssignments>>} */ (d.assignments ?? []),
    exams: /** @type {Awaited<ReturnType<typeof import('@/lib/exams/exams.js').fetchMyExams>>} */ (d.exams ?? []),
    grade: /** @type {Awaited<ReturnType<typeof import('@/lib/gradebook/gradebook.js').fetchMyCourseGrade>>} */ (d.grade ?? null),
  };
}

/**
 * The learner's assignment screen: course, assignment, instruction audio, their answer and their grade.
 * @param {string} courseId @param {string} assignmentId
 */
export async function fetchAssignmentPage(courseId, assignmentId) {
  const d = await read('get_assignment_page', { p_course: courseId, p_assignment: assignmentId });
  return {
    course: /** @type {Course | null} */ (d.course ?? null),
    assignment: /** @type {Awaited<ReturnType<typeof import('@/lib/assignments/assignments.js').fetchAssignment>>} */ (d.assignment ?? null),
    audio: /** @type {Awaited<ReturnType<typeof import('@/lib/assignments/assignments.js').fetchInstructionAudio>>} */ (d.audio ?? null),
    mine: /** @type {Awaited<ReturnType<typeof import('@/lib/submissions/submissions.js').fetchMySubmission>>} */ (d.mine ?? null),
    grade: /** @type {Awaited<ReturnType<typeof import('@/lib/grading/grading.js').fetchMyGrade>>} */ (d.grade ?? null),
  };
}
