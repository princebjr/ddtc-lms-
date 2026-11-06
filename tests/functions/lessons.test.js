// Phase 6 Edge Function tests: manage-lessons (HTML cleaned on the server, rights, reorder, publish)
// and lesson files through register-upload and finalize-upload (D18): real type and duration from the
// bytes, renamed and over-length files rejected, replacement keeps SUPERSEDED history (D09), peaks
// stored (ADR-006), attachments by content with macros refused. Real HTTP calls as real users.
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
  const reg = await call('register-upload', token, { resourceType, courseId, lessonId, filename, size: bytes.length });
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

  it('replacing keeps the old file as SUPERSEDED history; M4A and WAV are accepted', async () => {
    const m = await upload(owner.token, 'LESSON_AUDIO', m4a({ seconds: 754 }), 'lecture.m4a');
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(m.body.replaced).toBe(true);
    const w = await upload(owner.token, 'LESSON_AUDIO', wav(2), 'reading.wav', { peaks: [1, 2, 3] });
    expect(w.status, JSON.stringify(w.body)).toBe(200);
    const rows = await serviceGet(`lesson_audio_files?select=lifecycle_status&lesson_id=eq.${lessonId}&order=created_at`);
    expect(rows.map((/** @type {{ lifecycle_status: string }} */ r) => r.lifecycle_status)).toEqual(['SUPERSEDED', 'SUPERSEDED', 'ACTIVE']);
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
