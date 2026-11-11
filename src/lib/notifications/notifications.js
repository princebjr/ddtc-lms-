import { getSupabase } from '@/lib/supabase.js';

// Phase 11 (D21, D31, ADR-019): the notification centre. Each person reads only their own notifications
// (RLS) and may set read_at only; one switch decides course emails (account emails always go).

/**
 * @typedef {object} Notice
 * @property {string} id
 * @property {string} notification_type
 * @property {string} title
 * @property {string} message
 * @property {string | null} link_path
 * @property {string | null} read_at
 * @property {string} created_at
 */

export const PAGE_SIZE = 20;

/** The newest notifications, PAGE_SIZE at a time (before = the created_at of the last one shown). @param {string | null} [before] */
export async function fetchNotifications(before = null) {
  let q = getSupabase()
    .from('notifications')
    .select('id, notification_type, title, message, link_path, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return /** @type {Notice[]} */ (data ?? []);
}

/** How many are unread. */
export async function fetchUnreadCount() {
  const { count, error } = await getSupabase().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** @param {string} id */
export async function markRead(id) {
  const { error } = await getSupabase().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
  if (error) throw error;
}

export async function markAllRead() {
  const { error } = await getSupabase().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
}

/** Whether course emails are on (D21; on unless the person turned them off). @param {string} userId */
export async function fetchEmailEnabled(userId) {
  const { data, error } = await getSupabase().from('notification_preferences').select('email_enabled').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.email_enabled ?? true;
}

/** @param {string} userId @param {boolean} enabled */
export async function setEmailEnabled(userId, enabled) {
  const { error } = await getSupabase().from('notification_preferences').update({ email_enabled: enabled }).eq('user_id', userId);
  if (error) throw error;
}

/** Event for the header bell to refresh its count after something was read. */
export const NOTICES_CHANGED = 'ddtc:notices-changed';
export const announceNoticesChanged = () => window.dispatchEvent(new Event(NOTICES_CHANGED));
