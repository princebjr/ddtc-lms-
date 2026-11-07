import { callFunction } from '@/lib/functions.js';

// Deleting uploaded media (ADR-007): lesson audio (in use or a history version), lesson attachments
// and course covers. Only through the delete-media Edge Function, which re-checks the person and the
// course on the server; the browser has no right to delete rows or files itself.

/** @typedef {'lesson-audio' | 'lesson-attachment' | 'course-cover'} MediaKind */

/**
 * @param {MediaKind} kind
 * @param {string} id the audio, the attachment, or (for a cover) the course
 * @returns {Promise<{ deleted: true, already: boolean, fileRemoved: boolean }>}
 */
export async function deleteMedia(kind, id) {
  return /** @type {{ deleted: true, already: boolean, fileRemoved: boolean }} */ (await callFunction('delete-media', { kind, id }));
}
