// Phase 5 Edge Function tests: create-course, course-lifecycle, course-lecturers, manage-enrolments,
// the direct-publishing switch in set-user-role (ADR-005), course covers through register-upload and
// finalize-upload, and the course column of bulk-import-learners. Real HTTP calls as real users.
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAccount } from '../e2e/support/accounts.js';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { call, serviceGet, signedInAdmin, signedInAs } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAdmin>>} */
let admin;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let lecturerA;
/** @type {Awaited<ReturnType<typeof signedInAs>>} */
let lecturerB;
beforeAll(async () => {
  admin = await signedInAdmin();
  lecturerA = await signedInAs({ role: 'LECTURER', first: 'Ama', second: 'Boateng' });
  lecturerB = await signedInAs({ role: 'LECTURER', first: 'Grace', second: 'Owusu' });
});

/** A unique course code, so parallel runs never collide. */
function code() {
  return `T${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
}

/** @param {string} token @param {Record<string, unknown>} [extra] */
async function createCourse(token, extra = {}) {
  const res = await call('create-course', token, { title: 'Introduction to Biblical Studies', courseCode: code(), ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return /** @type {string} */ (res.body.courseId);
}

/** @param {string} courseId */
async function courseRow(courseId) {
  return (await serviceGet(`courses?select=status,cover_image_file_id,return_reason&id=eq.${courseId}`))[0];
}

describe('create-course', () => {
  it('refuses a call without a sign-in and refuses learners', async () => {
    expect((await call('create-course', null, { title: 'Nope', courseCode: code() })).status).toBe(401);
    const learner = await signedInAs();
    expect((await call('create-course', learner.token, { title: 'Nope', courseCode: code() })).status).toBe(403);
  });

  it('lets a lecturer with course creation create a DRAFT they own', async () => {
    const id = await createCourse(lecturerA.token);
    expect((await courseRow(id)).status).toBe('DRAFT');
    const owners = await serviceGet(`course_lecturers?select=lecturer_id,permission_level&course_id=eq.${id}`);
    expect(owners).toEqual([{ lecturer_id: lecturerA.userId, permission_level: 'OWNER' }]);
  });

  it('refuses a lecturer without course creation, and a duplicate code with a clear message', async () => {
    const noCreate = await signedInAs({ role: 'LECTURER' });
    await call('set-user-role', admin.token, { userId: noCreate.userId, canCreateCourses: false });
    expect((await call('create-course', noCreate.token, { title: 'Nope', courseCode: code() })).status).toBe(403);

    const dup = code();
    await createCourse(lecturerA.token, { courseCode: dup });
    const again = await call('create-course', lecturerA.token, { title: 'Again', courseCode: dup.toLowerCase() });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('A course with this code already exists');
  });

  it('lets an administrator create a course for a lecturer, and requires the owner', async () => {
    expect((await call('create-course', admin.token, { title: 'No owner', courseCode: code() })).status).toBe(400);
    const id = await createCourse(admin.token, { ownerId: lecturerB.userId });
    const owners = await serviceGet(`course_lecturers?select=lecturer_id,permission_level&course_id=eq.${id}`);
    expect(owners).toEqual([{ lecturer_id: lecturerB.userId, permission_level: 'OWNER' }]);
  });

  it('treats an administrator without two-step verification as no administrator', async () => {
    const aal1 = await signedInAs({ role: 'ADMIN' });
    const res = await call('create-course', aal1.token, { title: 'AAL1', courseCode: code(), ownerId: lecturerA.userId });
    expect(res.status).toBe(403);
  });
});

describe('course-lifecycle and direct publishing (D04, ADR-005)', () => {
  it('runs submit, return with a reason, submit again and approve', async () => {
    const id = await createCourse(lecturerA.token);
    expect((await call('course-lifecycle', lecturerB.token, { courseId: id, action: 'submit' })).status).toBe(403);
    expect((await call('course-lifecycle', lecturerA.token, { courseId: id, action: 'submit' })).body.course.status).toBe('PENDING_APPROVAL');
    expect((await call('course-lifecycle', lecturerA.token, { courseId: id, action: 'approve' })).status).toBe(403);
    expect((await call('course-lifecycle', admin.token, { courseId: id, action: 'return' })).status).toBe(400);
    expect((await call('course-lifecycle', admin.token, { courseId: id, action: 'return', reason: 'Add objectives' })).body.course.status).toBe('DRAFT');
    expect((await courseRow(id)).return_reason).toBe('Add objectives');
    await call('course-lifecycle', lecturerA.token, { courseId: id, action: 'submit' });
    expect((await call('course-lifecycle', admin.token, { courseId: id, action: 'approve' })).body.course.status).toBe('PUBLISHED');
  });

  it('lets an administrator switch direct publishing on for a lecturer, who then publishes without approval', async () => {
    const lecturer = await signedInAs({ role: 'LECTURER' });
    const on = await call('set-user-role', admin.token, { userId: lecturer.userId, canPublishDirectly: true });
    expect(on.status).toBe(200);
    expect(on.body.user.can_publish_directly).toBe(true);
    const id = await createCourse(lecturer.token);
    expect((await call('course-lifecycle', lecturer.token, { courseId: id, action: 'submit' })).body.course.status).toBe('PUBLISHED');
    const learner = await signedInAs();
    expect((await call('set-user-role', learner.token, { userId: lecturer.userId, canPublishDirectly: false })).status).toBe(403);
  });

  it('archives (OWNER only, not a co-lecturer) and restores with Undo', async () => {
    const id = await createCourse(lecturerA.token);
    await call('course-lecturers', lecturerA.token, { courseId: id, lecturerId: lecturerB.userId, action: 'add' });
    expect((await call('course-lifecycle', lecturerB.token, { courseId: id, action: 'archive' })).status).toBe(403);
    expect((await call('course-lifecycle', lecturerA.token, { courseId: id, action: 'archive' })).body.course.status).toBe('ARCHIVED');
    expect((await call('course-lifecycle', admin.token, { courseId: id, action: 'unarchive' })).body.course.status).toBe('DRAFT');
  });
});

describe('course-lecturers (D06)', () => {
  it('lets the OWNER add and remove a co-lecturer, and only an administrator transfer ownership', async () => {
    const id = await createCourse(lecturerA.token);
    expect((await call('course-lecturers', lecturerA.token, { courseId: id, lecturerId: lecturerB.userId, action: 'add' })).status).toBe(200);
    expect((await call('course-lecturers', lecturerB.token, { courseId: id, lecturerId: lecturerB.userId, action: 'remove' })).status).toBe(403);
    expect((await call('course-lecturers', lecturerA.token, { courseId: id, lecturerId: lecturerB.userId, action: 'transfer' })).status).toBe(403);
    expect((await call('course-lecturers', admin.token, { courseId: id, lecturerId: lecturerB.userId, action: 'transfer' })).status).toBe(200);
    const rows = await serviceGet(`course_lecturers?select=lecturer_id,permission_level&course_id=eq.${id}&removed_at=is.null&order=permission_level`);
    expect(rows).toEqual([
      { lecturer_id: lecturerB.userId, permission_level: 'OWNER' },
      { lecturer_id: lecturerA.userId, permission_level: 'CO_LECTURER' },
    ]);
  });

  it('blocks deactivating a lecturer who still owns a course', async () => {
    const owner = await signedInAs({ role: 'LECTURER' });
    const id = await createCourse(owner.token);
    const blocked = await call('set-user-role', admin.token, { userId: owner.userId, status: 'DEACTIVATED' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('owns_courses');
    await call('course-lecturers', admin.token, { courseId: id, lecturerId: lecturerA.userId, action: 'transfer' });
    expect((await call('set-user-role', admin.token, { userId: owner.userId, status: 'DEACTIVATED' })).status).toBe(200);
  });
});

describe('manage-enrolments (D05)', () => {
  it('is administrator only, skips duplicates, and returns previous statuses for Undo', async () => {
    const id = await createCourse(lecturerA.token);
    const learner = await createAccount();
    expect((await call('manage-enrolments', lecturerA.token, { action: 'add', courseId: id, learnerIds: [learner.id] })).status).toBe(403);
    const added = await call('manage-enrolments', admin.token, { action: 'add', courseId: id, learnerIds: [learner.id] });
    expect(added.status).toBe(200);
    expect(added.body.enrolled).toHaveLength(1);
    expect((await call('manage-enrolments', admin.token, { action: 'add', courseId: id, learnerIds: [learner.id] })).body.skipped).toBe(1);
    const done = await call('manage-enrolments', admin.token, { action: 'status', enrolmentIds: added.body.enrolled, status: 'COMPLETED' });
    expect(done.body.changes).toEqual([{ id: added.body.enrolled[0], previous: 'ACTIVE' }]);
  });
});

describe('course covers (D18)', () => {
  // A 1x1 PNG.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  /** @param {string} token @param {string} courseId @param {Buffer} bytes @param {string} name @param {string} [type] */
  async function upload(token, courseId, bytes, name, type = 'image/png') {
    const reg = await call('register-upload', token, { resourceType: 'COURSE_COVER', courseId, filename: name, size: bytes.length });
    if (reg.status !== 200) return reg;
    const s = requireSupabase();
    const put = await fetch(`${s.url}/storage/v1/object/upload/sign/${reg.body.bucket}/${reg.body.path}?token=${reg.body.token}`, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'x-upsert': 'false' },
      body: new Blob([new Uint8Array(bytes)]),
    });
    expect(put.ok).toBe(true);
    return call('finalize-upload', token, { fileId: reg.body.fileId });
  }

  it('lets the course lecturer set a cover, refuses another lecturer, and rejects a fake image', async () => {
    const id = await createCourse(lecturerA.token);
    expect((await upload(lecturerB.token, id, png, 'cover.png')).status).toBe(403);
    const ok = await upload(lecturerA.token, id, png, 'cover.png');
    expect(ok.status).toBe(200);
    expect((await courseRow(id)).cover_image_file_id).toBe(ok.body.fileId);
    const fake = await upload(lecturerA.token, id, Buffer.from('not an image at all'), 'fake.png');
    expect(fake.status).toBe(422);
    expect((await courseRow(id)).cover_image_file_id).toBe(ok.body.fileId);
  });

  // Since Phase 15 browsers shrink covers to WebP (JPEG in Safari) before uploading them.
  it('accepts a WebP cover, the format browsers now upload', async () => {
    const webp = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');
    const id = await createCourse(lecturerA.token);
    const ok = await upload(lecturerA.token, id, webp, 'cover.webp', 'image/webp');
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const [file] = await serviceGet(`file_objects?select=detected_mime_type,status&id=eq.${ok.body.fileId}`);
    expect(file).toMatchObject({ detected_mime_type: 'image/webp', status: 'VALIDATED' });
  });
});

describe('bulk-import-learners with a course column', () => {
  it('previews and enrols new and existing learners, and reports unknown courses', async () => {
    const id = await createCourse(lecturerA.token);
    const courseCode = (await serviceGet(`courses?select=course_code&id=eq.${id}`))[0].course_code;
    const existing = await createAccount();
    const existingEmail = (await serviceGet(`profiles?select=email&id=eq.${existing.id}`))[0].email;
    const fresh = `import-${randomUUID().slice(0, 8)}@ddtc.test`;
    const rows = [
      { firstName: 'Kofi', secondName: 'Mensah', email: fresh, courseCode },
      { firstName: 'Existing', secondName: 'Learner', email: existingEmail, courseCode },
      { firstName: 'No', secondName: 'Course', email: `x-${randomUUID().slice(0, 8)}@ddtc.test`, courseCode: 'ZZZ999' },
    ];
    const preview = await call('bulk-import-learners', admin.token, { rows, commit: false });
    expect(preview.body.results.map((/** @type {{ status: string }} */ r) => r.status)).toEqual(['ready', 'ready', 'error']);
    const done = await call('bulk-import-learners', admin.token, { rows, commit: true });
    expect(done.body.results.map((/** @type {{ status: string }} */ r) => r.status)).toEqual(['created', 'enrolled', 'error']);
    const enrolled = await serviceGet(`course_enrollments?select=learner_id&course_id=eq.${id}`);
    expect(enrolled).toHaveLength(2);
  });
});
