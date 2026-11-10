import { randomUUID } from 'node:crypto';
import { wav } from '../../fixtures/media.js';
import { requireSupabase } from './local-supabase.js';

// Assignment fixtures for the Phase 7 end-to-end suite, written through the trusted path (service
// role, as Edge Functions do), so a learner test starts from a published assignment without first
// driving the lecturer's screens. The instruction audio is a real stored WAV with its file record.

/** @param {string} path @param {RequestInit} [init] */
async function rest(path, init = {}) {
  const s = requireSupabase();
  const res = await fetch(`${s.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/**
 * A published assignment in one of the course's parts (weekly assignments unless asked; a practical is
 * marked in person, ADR-016).
 * @param {{ courseId: string, ownerId: string, title: string, dueAt: string, contentType?: 'TEXT' | 'AUDIO' | 'TEXT_AND_AUDIO',
 *   text?: string, withAudio?: boolean, allowLate?: boolean, formats?: string[], part?: 'ASSIGNMENTS' | 'PRACTICALS', maxMarks?: number }} options
 * @returns {Promise<{ id: string }>}
 */
export async function createAssignmentFixture({ courseId, ownerId, title, dueAt, contentType = 'TEXT', text = '<p>Read Genesis 1 and reflect.</p>', withAudio = false, allowLate = false, formats = ['TEXT', 'AUDIO'], part = 'ASSIGNMENTS', maxMarks = 20 }) {
  // Since Phase 10.1 (ADR-016) a course has three parts; an assignment goes in weekly assignments unless asked.
  const [category] = await rest(`grade_categories?select=id&course_id=eq.${courseId}&archived_at=is.null&part=eq.${part}&limit=1`);
  const [assignment] = await rest('assignments', {
    method: 'POST',
    body: JSON.stringify({
      course_id: courseId,
      category_id: category.id,
      title,
      content_type: contentType,
      text_instructions: contentType === 'AUDIO' ? '' : text,
      due_at: dueAt,
      allow_late: allowLate,
      max_marks: maxMarks,
      accepted_formats: formats,
      created_by: ownerId,
    }),
  });
  if (withAudio) {
    const s = requireSupabase();
    const fileId = randomUUID();
    const path = `${courseId}/${assignment.id}/${fileId}.wav`;
    const bytes = wav(8);
    const put = await fetch(`${s.url}/storage/v1/object/assignment-instructions-audio/${path}`, {
      method: 'POST',
      headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'audio/wav' },
      body: new Blob([bytes]),
    });
    if (!put.ok) throw new Error(`storing the instruction audio failed: ${put.status} ${await put.text()}`);
    await rest('file_objects', {
      method: 'POST',
      body: JSON.stringify({
        id: fileId,
        bucket_name: 'assignment-instructions-audio',
        storage_path: path,
        original_filename: 'brief.wav',
        safe_download_filename: 'brief.wav',
        uploaded_by: ownerId,
        status: 'VALIDATED',
        resource_type: 'ASSIGNMENT_INSTRUCTION_AUDIO',
        resource_id: assignment.id,
        detected_mime_type: 'audio/wav',
        file_size: bytes.length,
        duration_seconds: 8,
        validated_at: new Date().toISOString(),
      }),
    });
    await rest(`assignments?id=eq.${assignment.id}`, { method: 'PATCH', body: JSON.stringify({ instruction_audio_file_id: fileId }) });
  }
  await rest(`assignments?id=eq.${assignment.id}`, { method: 'PATCH', body: JSON.stringify({ publication_status: 'PUBLISHED', published_at: new Date().toISOString() }) });
  return { id: assignment.id };
}
