import { getSupabase } from '@/lib/supabase.js';

// Announcements (Phase 11; owner request and answers of 2026-11-11, ADR-019). A lecturer sends to a course
// they teach; an administrator to everyone, a course or a branch. The database checks the sender and the
// audience, notifies each learner (and emails them unless they turned email off) and audits it.

/**
 * @typedef {object} Announcement
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {string} created_at
 * @property {string | null} course_id
 * @property {string | null} branch_id
 * @property {boolean} to_everyone
 * @property {number} recipients
 * @property {string | null} archived_at
 * @property {{ title: string, course_code: string } | null} course
 * @property {{ name: string } | null} branch
 */

const COLUMNS =
  'id, title, body, created_at, course_id, branch_id, to_everyone, recipients, archived_at, course:courses(title, course_code), branch:branches(name)';

/** Announcements the person may read, newest first (optionally one course's). @param {{ courseId?: string }} [q] */
export async function fetchAnnouncements({ courseId } = {}) {
  let query = getSupabase().from('announcements').select(COLUMNS).is('archived_at', null).order('created_at', { ascending: false }).limit(50);
  if (courseId) query = query.eq('course_id', courseId);
  const { data, error } = await query;
  if (error) throw error;
  return /** @type {Announcement[]} */ (/** @type {unknown} */ (data ?? []));
}

/** @param {{ courseId?: string | null, branchId?: string | null, everyone?: boolean, title: string, body: string }} a */
export async function sendAnnouncement({ courseId = null, branchId = null, everyone = false, title, body }) {
  const { data, error } = await getSupabase().rpc('announcement_send', {
    p_course: /** @type {string} */ (courseId),
    p_branch: /** @type {string} */ (branchId),
    p_everyone: everyone,
    p_title: title,
    p_body: body,
  });
  if (error) throw error;
  return /** @type {string} */ (data);
}

/** @param {string} id */
export async function archiveAnnouncement(id) {
  const { error } = await getSupabase().rpc('announcement_archive', { p_announcement: id });
  if (error) throw error;
}

/** Who an announcement went to, in words. @param {Announcement} a */
export function audienceLabel(a) {
  if (a.to_everyone) return 'All learners';
  if (a.branch) return `${a.branch.name} branch`;
  if (a.course) return `${a.course.course_code} ${a.course.title}`;
  return 'Learners';
}
