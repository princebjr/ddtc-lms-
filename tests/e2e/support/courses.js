import { randomUUID } from 'node:crypto';
import { requireSupabase } from './local-supabase.js';

// Course fixtures for the Phase 5 end-to-end suite, written through the trusted path (service role,
// as migrations and Edge Functions do), so each test starts from exactly the state it needs.

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

/** A course code no other parallel test uses. */
export function uniqueCode() {
  return `E${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`;
}

/**
 * @param {{ ownerId: string, title?: string, code?: string, status?: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'ARCHIVED' }} options
 * @returns {Promise<{ id: string, title: string, code: string }>}
 */
export async function createCourseFixture({ ownerId, title = `Course ${randomUUID().slice(0, 6)}`, code = uniqueCode(), status = 'PUBLISHED' }) {
  const now = new Date().toISOString();
  const [course] = await rest('courses', {
    method: 'POST',
    body: JSON.stringify({
      title,
      course_code: code,
      created_by: ownerId,
      status,
      published_at: status === 'PUBLISHED' || status === 'ARCHIVED' ? now : null,
      archived_at: status === 'ARCHIVED' ? now : null,
    }),
  });
  await rest('course_lecturers', {
    method: 'POST',
    body: JSON.stringify({ course_id: course.id, lecturer_id: ownerId, permission_level: 'OWNER', assigned_by: ownerId }),
  });
  return { id: course.id, title, code };
}

/**
 * @param {string} courseId @param {string} learnerId @param {string} byId
 * @param {'ACTIVE' | 'COMPLETED' | 'WITHDRAWN' | 'SUSPENDED'} [status]
 */
export async function enrolFixture(courseId, learnerId, byId, status = 'ACTIVE') {
  await rest('course_enrollments', {
    method: 'POST',
    body: JSON.stringify({ course_id: courseId, learner_id: learnerId, enrolled_by: byId, enrolment_status: status }),
  });
}

/** @param {string} courseId */
export async function courseState(courseId) {
  const [row] = await rest(`courses?select=status,return_reason&id=eq.${courseId}`);
  return /** @type {{ status: string, return_reason: string | null } | undefined} */ (row);
}

/** @param {string} title */
export async function courseByTitle(title) {
  const [row] = await rest(`courses?select=id,status,course_code&title=eq.${encodeURIComponent(title)}`);
  return /** @type {{ id: string, status: string, course_code: string } | undefined} */ (row);
}

/** @param {string} courseId @param {string} learnerId */
export async function enrolmentStatuses(courseId, learnerId) {
  const rows = await rest(`course_enrollments?select=enrolment_status&course_id=eq.${courseId}&learner_id=eq.${learnerId}&order=created_at`);
  return rows.map((/** @type {{ enrolment_status: string }} */ r) => r.enrolment_status);
}

/** @param {string} id */
export async function canPublishDirectly(id) {
  const [row] = await rest(`profiles?select=can_publish_directly&id=eq.${id}`);
  return Boolean(row?.can_publish_directly);
}
