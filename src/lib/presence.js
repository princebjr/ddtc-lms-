import { parsePublicEnv } from '@/lib/env.js';
import { getSupabase } from '@/lib/supabase.js';

// Live presence (Step 11.1, ADR-020; owner answers of 2026-11-06). Supabase Realtime Presence on one
// private channel per course, presence:course:{id}; the database decides who may join (migration 43).
// The browser announces only its own user id; names come from presence_people, for course-mates only.
// Realtime is loaded only when presence starts, so the first page stays small (RESPONSIVE.md 15.5).

/** @type {Promise<import('@supabase/realtime-js').RealtimeClient> | null} */
let realtime = null;

/** The app's Realtime client, sending the signed-in person's token on connect and every heartbeat. */
export function getRealtime() {
  if (!realtime) {
    realtime = import('@supabase/realtime-js').then(({ RealtimeClient }) => {
      const env = parsePublicEnv(import.meta.env);
      const sb = getSupabase();
      return new RealtimeClient(`${sb.url.replace(/^http/, 'ws')}/realtime/v1`, {
        params: { apikey: env.VITE_SUPABASE_ANON_KEY },
        accessToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
      });
    });
  }
  return realtime;
}

/** The courses whose presence channel the signed-in person may join. */
export async function fetchPresenceCourses() {
  const { data, error } = await getSupabase().rpc('presence_my_courses');
  if (error) throw error;
  return /** @type {string[]} */ (data ?? []);
}

/**
 * @typedef {object} OnlinePerson
 * @property {string} id
 * @property {string} first_name
 * @property {string} second_name
 * @property {'LEARNER' | 'LECTURER' | 'ADMIN'} role
 * @property {string | null} profile_image_file_id
 */

/** Who the announced ids are (course-mates only; checked by the database). @param {string[]} ids */
export async function fetchPresencePeople(ids) {
  if (!ids.length) return [];
  const { data, error } = await getSupabase().rpc('presence_people', { p_ids: ids });
  if (error) throw error;
  return /** @type {OnlinePerson[]} */ (data ?? []);
}

export const presenceTopic = (/** @type {string} */ courseId) => `presence:course:${courseId}`;
