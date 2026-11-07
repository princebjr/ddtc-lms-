// Phase 6 Edge Function tests: manage-lessons (HTML cleaned on the server, rights, reorder, publish)
// and lesson files through register-upload and finalize-upload (D18): real type and duration from the
// bytes, renamed and over-length files rejected, replacement keeps SUPERSEDED history (D09), peaks
// stored (ADR-006), attachments by content with macros refused; ADR-007: up to 10 audio files with
// titles and order, rename and reorder, delete-media for audio, attachments and covers (record kept,
// file gone from Storage, already-missing files fine). Real HTTP calls as real users.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { concat, m4a, mp3, pdf, wav, zip } from '../fixtures/media.js';
import { call, serviceGet, signedInAs } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let owner;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let other;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let learner;
let courseId = '';
let lessonId = '';

beforeAll(async () => {
  owner = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  other = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
  learner = await signedInAs();
  const course = await call('create-course', owner.token, { title: 'Introduction to Biblical Studies', courseCode: `L${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}` });
  courseId = course.body.courseId;
  const lesson = await call('manage-lessons', owner.token, { action: 'save', courseId, title: 'Welcome and overview', content: '<p>Welcome</p>' });
  lessonId = lesson.body.lessonId;
});

/**
 * register-upload, the browser's upload to the signed path, then finalize-upload.
 * @param {string} token @param {'LESSON_AUDIO' | 'LESSON_ATTACHMENT'} resourceType @param {Uint8Array} bytes @param {string} filename
 * @param {Record<string, unknown>} [extra] fields for finalize-upload (peaks, title)
 */
async function upload(token, resourceType, bytes, filename, extra = {}) {
  // The audio being replaced goes to both steps: register-upload checks the 10-audio limit with it.
  const replace = extra.replaceAudioId ? { replaceAudioId: extra.replaceAudioId } : {};
  const reg = await call('register-upload', token, { resourceType, courseId, lessonId, filename, size: bytes.length, ...replace });
  if (reg.status !== 200) return reg;
  const s = requireSupabase();
  const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
    method: 'PUT',
    headers: { 'Content-Type': reg.body.contentType },
    body: new Blob([new Uint8Array(bytes)]),
  });
  expect(put.ok, await put.clone().text()).toBe(true);
  return call('finalize-upload', token, { fileId: reg.body.fileId, ...extra });
}

const peaks = Array.from({ length: 128 }, (_, i) => Math.abs(Math.sin(i / 9)));

describe('manage-lessons', () => {
  it('cleans the lesson HTML on the server: scripts, event handlers and script links are removed', async () => {
    const res = await call('manage-lessons', owner.token, {
      action: 'save',
      courseId,
      lessonId,
      title: 'Welcome and overview',
      content: '<h1>Welcome</h1><p onclick="steal()">Hello <strong>class</strong></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a> <a href="https://example.org">good</a>',
    });
    expect(res.status).toBe(200);
    const saved = (await serviceGet(`lessons?select=content&id=eq.${lessonId}`))[0].content;
    expect(saved).toBe(res.body.content);
    expect(saved).not.toMatch(/script|onclick|javascript/i);
    expect(saved).toContain('<h2>Welcome</h2>');
    expect(saved).toContain('<strong>class</strong>');
    expect(saved).toContain('<a href="https://example.org" target="_blank" rel="noopener noreferrer nofollow">good</a>');
  });

  it('refuses learners and lecturers of other courses', async () => {
    for (const caller of [learner, other]) {
      const res = await call('manage-lessons', caller.token, { action: 'save', courseId, title: 'Not mine', content: '<p>x</p>' });
      expect(res.status).toBe(403);
    }
    expect((await call('manage-lessons', other.token, { action: 'publish', lessonId, publish: true })).status).toBe(403);
  });

  it('publishes and reorders', async () => {
    const second = await call('manage-lessons', owner.token, { action: 'save', courseId, title: 'How to study the Bible', content: '<p>Read</p>' });
    expect((await call('manage-lessons', owner.token, { action: 'publish', lessonId, publish: true })).body.lesson.status).toBe('PUBLISHED');
    expect((await call('manage-lessons', owner.token, { action: 'reorder', courseId, lessonIds: [second.body.lessonId, lessonId] })).status).toBe(200);
    const order = await serviceGet(`lessons?select=id&course_id=eq.${courseId}&order=position`);
    expect(order.map((/** @type {{ id: string }} */ r) => r.id)).toEqual([second.body.lessonId, lessonId]);
    expect((await call('manage-lessons', owner.token, { action: 'reorder', courseId, lessonIds: [lessonId] })).status).toBe(400);
  });
});

describe('lesson audio (D18, D09, ADR-006)', () => {
  it('validates an MP3 from its bytes, stores its duration and peaks, and makes it the ACTIVE audio', async () => {
    const res = await upload(owner.token, 'LESSON_AUDIO', mp3({ frames: 100 }), 'welcome.mp3', { peaks });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.mimeType).toBe('audio/mpeg');
    expect(res.body.replaced).toBe(false);
    const [file] = await serviceGet(`file_objects?select=status,duration_seconds,waveform_peaks&id=eq.${res.body.fileId}`);
    expect(file.status).toBe('VALIDATED');
    expect(Number(file.duration_seconds)).toBeCloseTo(2.61, 1);
    expect(file.waveform_peaks).toHaveLength(128);
  });

  it('replacing an audio keeps its place and title and the old file as SUPERSEDED history; a new upload is added at the end; M4A and WAV are accepted', async () => {
    const [first] = await serviceGet(`lesson_audio_files?select=id,title,position&lesson_id=eq.${lessonId}&lifecycle_status=eq.ACTIVE`);
    expect(first).toMatchObject({ title: 'welcome', position: 1 });
    const m = await upload(owner.token, 'LESSON_AUDIO', m4a({ seconds: 754 }), 'lecture.m4a', { replaceAudioId: first.id });
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(m.body.replaced).toBe(true);
    const w = await upload(owner.token, 'LESSON_AUDIO', wav(2), 'reading.wav', { peaks: [1, 2, 3], title: 'Bible reading' });
    expect(w.status, JSON.stringify(w.body)).toBe(200);
    expect(w.body.replaced).toBe(false);
    const rows = await serviceGet(`lesson_audio_files?select=lifecycle_status,title,position&lesson_id=eq.${lessonId}&order=created_at`);
    expect(rows).toEqual([
      { lifecycle_status: 'SUPERSEDED', title: 'welcome', position: null },
      { lifecycle_status: 'ACTIVE', title: 'welcome', position: 1 },
      { lifecycle_status: 'ACTIVE', title: 'Bible reading', position: 2 },
    ]);
    const [file] = await serviceGet(`file_objects?select=waveform_peaks&id=eq.${w.body.fileId}`);
    expect(file.waveform_peaks).toBeNull(); // malformed peaks are dropped, not trusted
  });

  it('rejects a renamed non-audio file, an over-length file and a name that does not match the content', async () => {
    const renamed = await upload(owner.token, 'LESSON_AUDIO', pdf(), 'sermon.mp3');
    expect(renamed.status).toBe(422);
    expect(renamed.body.message).toBe('The file is not an MP3, M4A or WAV audio file.');
    const long = await upload(owner.token, 'LESSON_AUDIO', mp3({ frames: 10, xingFrames: 248000 }), 'long.mp3');
    expect(long.status).toBe(422);
    expect(long.body.message).toBe('The audio is longer than 90 minutes.');
    const mismatch = await upload(owner.token, 'LESSON_AUDIO', wav(1), 'wave.mp3');
    expect(mismatch.status).toBe(422);
    const rejected = await serviceGet(`file_objects?select=status&resource_id=eq.${lessonId}&status=in.(REJECTED,DELETED)`);
    expect(rejected).toHaveLength(3);
  });

  it('refuses a lecturer of another course and a learner at register-upload', async () => {
    for (const caller of [other, learner]) {
      const res = await call('register-upload', caller.token, { resourceType: 'LESSON_AUDIO', courseId, lessonId, filename: 'x.mp3', size: 1000 });
      expect(res.status).toBe(403);
    }
  });
});

describe('lesson attachments', () => {
  it('accepts PDF and DOCX by content and refuses macros', async () => {
    const p = await upload(owner.token, 'LESSON_ATTACHMENT', pdf(), 'notes.pdf', { title: 'Lesson notes' });
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    const d = await upload(owner.token, 'LESSON_ATTACHMENT', zip(['[Content_Types].xml', 'word/document.xml']), 'reading.docx');
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    const macro = await upload(owner.token, 'LESSON_ATTACHMENT', zip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin']), 'macro.docx');
    expect(macro.status).toBe(422);
    const titles = await serviceGet(`lesson_attachments?select=title&lesson_id=eq.${lessonId}&order=position`);
    expect(titles.map((/** @type {{ title: string }} */ r) => r.title)).toEqual(['Lesson notes', 'reading.docx']);
    const wrong = await upload(owner.token, 'LESSON_ATTACHMENT', concat([0xff, 0xd8, 0xff], new Uint8Array(100)), 'photo.pdf');
    expect(wrong.status).toBe(422);
  });
});

// ---------------------------------------------------------------- ADR-007: lesson media management
/** The Storage object behind a file record still exists (service key, Node only). @param {string} fileId */
async function storedObjectExists(fileId) {
  const [file] = await serviceGet(`file_objects?select=bucket_name,storage_path&id=eq.${fileId}`);
  const s = requireSupabase();
  const res = await fetch(`${s.url}/storage/v1/object/authenticated/${file.bucket_name}/${file.storage_path}`, {
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}` },
  });
  return res.ok;
}

/** @param {string} lesson */
const activeAudio = (lesson) => serviceGet(`lesson_audio_files?select=id,file_object_id,title,position&lesson_id=eq.${lesson}&lifecycle_status=eq.ACTIVE&order=position`);

describe('lesson media management (ADR-007)', () => {
  it('adds up to 10 audio files; the eleventh is refused before anything is uploaded, but replacing still works', async () => {
    for (let i = (await activeAudio(lessonId)).length; i < 10; i += 1) {
      const res = await upload(owner.token, 'LESSON_AUDIO', wav(1), `part-${i + 1}.wav`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    const audio = await activeAudio(lessonId);
    expect(audio.map((/** @type {{ position: number }} */ a) => a.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const eleventh = await call('register-upload', owner.token, { resourceType: 'LESSON_AUDIO', courseId, lessonId, filename: 'extra.wav', size: 16044 });
    expect(eleventh.status).toBe(409);
    expect(eleventh.body.message).toBe('A lesson can have up to 10 audio files. Delete one to add another.');
    const replace = await upload(owner.token, 'LESSON_AUDIO', wav(1), 'better.wav', { replaceAudioId: audio[9].id });
    expect(replace.status, JSON.stringify(replace.body)).toBe(200);
    expect((await activeAudio(lessonId))[9].title).toBe(audio[9].title);
  });

  it('renames and reorders audio for the course lecturers only', async () => {
    const audio = await activeAudio(lessonId);
    expect((await call('manage-lessons', owner.token, { action: 'rename-audio', audioId: audio[0].id, title: 'Introduction' })).status).toBe(200);
    for (const caller of [learner, other]) {
      expect((await call('manage-lessons', caller.token, { action: 'rename-audio', audioId: audio[0].id, title: 'Mine' })).status).toBe(403);
    }
    const reversed = audio.map((/** @type {{ id: string }} */ a) => a.id).reverse();
    expect((await call('manage-lessons', owner.token, { action: 'reorder-audio', lessonId, audioIds: reversed })).status).toBe(200);
    const after = await activeAudio(lessonId);
    expect(after.map((/** @type {{ id: string }} */ a) => a.id)).toEqual(reversed);
    expect(after[9].title).toBe('Introduction');
    expect((await call('manage-lessons', owner.token, { action: 'reorder-audio', lessonId, audioIds: reversed.slice(1) })).status).toBe(400);
  });

  it('deletes an audio: refused for learners and other lecturers; the record is kept, the file leaves Storage, the rest close the gap; again is harmless', async () => {
    const audio = await activeAudio(lessonId);
    const target = audio[4];
    for (const caller of [learner, other]) {
      expect((await call('delete-media', caller.token, { kind: 'lesson-audio', id: target.id })).status).toBe(403);
    }
    expect(await storedObjectExists(target.file_object_id)).toBe(true);
    const res = await call('delete-media', owner.token, { kind: 'lesson-audio', id: target.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ deleted: true, already: false, fileRemoved: true });
    const [row] = await serviceGet(`lesson_audio_files?select=lifecycle_status,deleted_by,deleted_at&id=eq.${target.id}`);
    expect(row.lifecycle_status).toBe('DELETED');
    expect(row.deleted_by).toBe(owner.userId);
    expect(row.deleted_at).not.toBeNull();
    const [file] = await serviceGet(`file_objects?select=status,deleted_at&id=eq.${target.file_object_id}`);
    expect(file.status).toBe('DELETED');
    expect(await storedObjectExists(target.file_object_id)).toBe(false);
    expect((await activeAudio(lessonId)).map((/** @type {{ position: number }} */ a) => a.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const again = await call('delete-media', owner.token, { kind: 'lesson-audio', id: target.id });
    expect(again.status).toBe(200);
    expect(again.body.already).toBe(true);
    const audit = await serviceGet(`audit_logs?select=actor_id&action=eq.lesson.audio_deleted&metadata->>audio=eq.${target.id}`);
    expect(audit).toEqual([{ actor_id: owner.userId }]);
  });

  it('deletes cleanly when the file is already missing from Storage', async () => {
    const [target] = await activeAudio(lessonId);
    const [file] = await serviceGet(`file_objects?select=bucket_name,storage_path&id=eq.${target.file_object_id}`);
    const s = requireSupabase();
    const gone = await fetch(`${s.url}/storage/v1/object/${file.bucket_name}`, {
      method: 'DELETE',
      headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [file.storage_path] }),
    });
    expect(gone.ok).toBe(true);
    const res = await call('delete-media', owner.token, { kind: 'lesson-audio', id: target.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await serviceGet(`file_objects?select=status&id=eq.${target.file_object_id}`))[0].status).toBe('DELETED');
  });

  it('deletes an attachment the same way', async () => {
    const added = await upload(owner.token, 'LESSON_ATTACHMENT', pdf(), 'handout.pdf', { title: 'Handout' });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect((await call('delete-media', learner.token, { kind: 'lesson-attachment', id: added.body.attachmentId })).status).toBe(403);
    const res = await call('delete-media', owner.token, { kind: 'lesson-attachment', id: added.body.attachmentId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [row] = await serviceGet(`lesson_attachments?select=removed_by&id=eq.${added.body.attachmentId}`);
    expect(row.removed_by).toBe(owner.userId);
    expect((await serviceGet(`file_objects?select=status&id=eq.${added.body.fileId}`))[0].status).toBe('DELETED');
    expect(await storedObjectExists(added.body.fileId)).toBe(false);
  });

  it('removes a course cover: the course falls back to the placeholder and the file leaves Storage', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const reg = await call('register-upload', owner.token, { resourceType: 'COURSE_COVER', courseId, filename: 'cover.png', size: png.length });
    const s = requireSupabase();
    const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Blob([new Uint8Array(png)]),
    });
    expect(put.ok).toBe(true);
    expect((await call('finalize-upload', owner.token, { fileId: reg.body.fileId })).status).toBe(200);
    for (const caller of [learner, other]) {
      expect((await call('delete-media', caller.token, { kind: 'course-cover', id: courseId })).status).toBe(403);
    }
    const res = await call('delete-media', owner.token, { kind: 'course-cover', id: courseId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await serviceGet(`courses?select=cover_image_file_id&id=eq.${courseId}`))[0].cover_image_file_id).toBeNull();
    expect((await serviceGet(`file_objects?select=status&id=eq.${reg.body.fileId}`))[0].status).toBe('DELETED');
    expect(await storedObjectExists(reg.body.fileId)).toBe(false);
    const none = await call('delete-media', owner.token, { kind: 'course-cover', id: courseId });
    expect(none.status).toBe(200);
    expect(none.body.already).toBe(true);
  });
});
