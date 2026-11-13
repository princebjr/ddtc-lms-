import { markAllStale } from '@/lib/data-cache.js';
import { callFunction } from '@/lib/functions.js';
import { getStorage, signedUrl } from '@/lib/storage.js';
import { getSupabase } from '@/lib/supabase.js';

// Lesson data (Phase 6). Reads go through RLS (lecturers and administrators see every lesson of
// their courses; learners only published lessons of courses they are enrolled in). Saving,
// publishing, reordering lessons and renaming or reordering a lesson's audio go through
// manage-lessons; files through the D18 pipeline (src/lib/uploads.js); deleting through delete-media
// (src/lib/media.js, ADR-007). Learners record progress with mark_lesson, which refuses read-only
// enrolments and archived courses.

/** @typedef {'DRAFT' | 'PUBLISHED'} PublicationStatus */
/** @typedef {{ id: string, title: string, position: number, publication_status: PublicationStatus, audio_count: number, updated_at: string }} LessonSummary */
/** @typedef {{ id: string, course_id: string, title: string, content: string, position: number, publication_status: PublicationStatus, published_at: string | null, updated_at: string }} Lesson */
/**
 * @typedef {object} LessonMedia
 * @property {'AUDIO' | 'ATTACHMENT'} kind
 * @property {string} item_id
 * @property {string} file_object_id
 * @property {string} title
 * @property {string} bucket_name
 * @property {string} storage_path
 * @property {string} safe_download_filename
 * @property {string | null} mime_type
 * @property {number | null} file_size
 * @property {number | null} duration_seconds
 * @property {number[] | null} waveform_peaks
 * @property {number} sort_order
 */

export const LESSON_STATUS_LABEL = /** @type {const} */ ({ DRAFT: 'Draft', PUBLISHED: 'Published' });

/** @param {string} courseId @returns {Promise<LessonSummary[]>} */
export async function fetchLessons(courseId, { withAudio = false } = {}) {
  const audio = withAudio ? ', lesson_audio_files(id, lifecycle_status)' : '';
  const { data, error } = await getSupabase()
    .from('lessons')
    .select(`id, title, position, publication_status, updated_at${audio}`)
    .eq('course_id', courseId)
    .order('position');
  if (error) throw error;
  return (data ?? []).map((/** @type {any} */ l) => ({
    id: l.id,
    title: l.title,
    position: l.position,
    publication_status: l.publication_status,
    updated_at: l.updated_at,
    audio_count: (l.lesson_audio_files ?? []).filter((/** @type {{ lifecycle_status: string }} */ a) => a.lifecycle_status === 'ACTIVE').length,
  }));
}

/** @param {string} id @returns {Promise<Lesson | null>} */
export async function fetchLesson(id) {
  const { data, error } = await getSupabase()
    .from('lessons')
    .select('id, course_id, title, content, position, publication_status, published_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return /** @type {Lesson | null} */ (data);
}

/** Most audio files a lesson may have (ADR-007); the server enforces it. */
export const MAX_LESSON_AUDIO = 10;

/**
 * The lesson's audio files in the lecturer's order and its attachments (only for people who may
 * see the lesson). @param {string} lessonId
 */
export async function fetchLessonMedia(lessonId) {
  const { data, error } = await getSupabase().rpc('lesson_media', { p_lesson: lessonId });
  if (error) throw error;
  const rows = /** @type {LessonMedia[]} */ (data ?? []);
  return { audios: rows.filter((r) => r.kind === 'AUDIO'), attachments: rows.filter((r) => r.kind === 'ATTACHMENT') };
}

/**
 * @typedef {{ id: string, title: string, lifecycle_status: 'SUPERSEDED' | 'ARCHIVED' | 'DELETED', created_at: string, superseded_at: string | null, deleted_at: string | null }} AudioHistoryEntry
 */

/** Replaced and deleted audio of a lesson, newest first, for its lecturers (D09, ADR-007). @param {string} lessonId */
export async function fetchAudioHistory(lessonId) {
  const { data, error } = await getSupabase()
    .from('lesson_audio_files')
    .select('id, title, lifecycle_status, created_at, superseded_at, deleted_at')
    .eq('lesson_id', lessonId)
    .neq('lifecycle_status', 'ACTIVE')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return /** @type {AudioHistoryEntry[]} */ (data ?? []);
}

/** The signed-in learner's progress in a course: lesson id -> completed. @param {string} courseId */
export async function fetchMyProgress(courseId) {
  const { data, error } = await getSupabase()
    .from('lesson_progress')
    .select('lesson_id, completion_status, lessons!inner(course_id)')
    .eq('lessons.course_id', courseId);
  if (error) throw error;
  /** @type {Record<string, boolean>} */
  const done = {};
  for (const row of /** @type {any[]} */ (data ?? [])) done[row.lesson_id] = row.completion_status === 'COMPLETED';
  return done;
}

/**
 * @param {{ courseId: string, lessonId?: string, title: string, content: string }} lesson
 * @returns {Promise<{ lessonId: string, content: string }>} the saved (cleaned) content
 */
export async function saveLesson({ courseId, lessonId, title, content }) {
  return /** @type {{ lessonId: string, content: string }} */ (await callFunction('manage-lessons', { action: 'save', courseId, lessonId, title, content }));
}

/** @param {string} lessonId @param {boolean} publish @returns {Promise<PublicationStatus>} */
export async function setLessonPublished(lessonId, publish) {
  const res = /** @type {{ lesson: { status: PublicationStatus } }} */ (await callFunction('manage-lessons', { action: 'publish', lessonId, publish }));
  return res.lesson.status;
}

/** @param {string} courseId @param {string[]} lessonIds the new order, every lesson once */
export async function reorderLessons(courseId, lessonIds) {
  await callFunction('manage-lessons', { action: 'reorder', courseId, lessonIds });
}

/** @param {string} audioId @param {string} title */
export async function renameAudio(audioId, title) {
  await callFunction('manage-lessons', { action: 'rename-audio', audioId, title });
}

/** @param {string} lessonId @param {string[]} audioIds the new order, every audio in use once */
export async function reorderAudio(lessonId, audioIds) {
  await callFunction('manage-lessons', { action: 'reorder-audio', lessonId, audioIds });
}

/** @param {string} lessonId @param {boolean} completed */
export async function markLesson(lessonId, completed) {
  const { error } = await getSupabase().rpc('mark_lesson', { p_lesson: lessonId, p_completed: completed });
  if (error) throw error;
  markAllStale(); // the course page's progress is asked again next time it opens
}

/** A playback URL (one hour, the user's own session, D19). @param {LessonMedia} media */
export function playbackUrl(media) {
  return signedUrl(media.bucket_name, media.storage_path);
}

/**
 * Starts a download with the file's safe name (a 5-minute link, D19). On iPhone this saves to Files.
 * @param {LessonMedia} media
 */
export async function downloadMedia(media) {
  const storage = await getStorage();
  const { data, error } = await storage.from(media.bucket_name).createSignedUrl(media.storage_path, 300, { download: media.safe_download_filename });
  if (error || !data?.signedUrl) throw error ?? new Error('download');
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = media.safe_download_filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
