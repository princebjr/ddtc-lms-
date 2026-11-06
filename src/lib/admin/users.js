import { getSupabase } from '@/lib/supabase.js';

// Administrator user data. Reads go through RLS (an AAL2 administrator reads every profile);
// every change goes through an Edge Function (src/lib/functions.js).

/** @typedef {import('@/lib/database.types').Database['public']['Tables']['profiles']['Row']} ProfileRow */
/** @typedef {Pick<ProfileRow, 'id' | 'first_name' | 'second_name' | 'email' | 'role' | 'account_status' | 'can_create_courses' | 'profile_image_file_id' | 'created_at'>} AdminUser */
/** @typedef {'all' | 'lecturers' | 'learners'} UsersView */

export const PAGE_SIZE = 50;
const COLUMNS = 'id, first_name, second_name, email, role, account_status, can_create_courses, profile_image_file_id, created_at';

export const ROLE_LABEL = /** @type {const} */ ({ ADMIN: 'Administrator', LECTURER: 'Lecturer', LEARNER: 'Learner' });
export const STATUS_LABEL = /** @type {const} */ ({ ACTIVE: 'Active', SUSPENDED: 'Suspended', DEACTIVATED: 'Deactivated' });
/** @type {Record<string, 'success' | 'warning' | 'neutral'>} */
export const STATUS_TONE = { ACTIVE: 'success', SUSPENDED: 'warning', DEACTIVATED: 'neutral' };

/**
 * @typedef {object} UserQuery
 * @property {UsersView} view
 * @property {string} search
 * @property {'' | 'ADMIN' | 'LECTURER' | 'LEARNER'} role
 * @property {'' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'} status
 * @property {'name' | 'newest'} sort
 * @property {number} page   0-based
 */

/** Escapes characters that have a meaning in a PostgREST `or` filter or a LIKE pattern. @param {string} s */
export function likeTerm(s) {
  return s.trim().replace(/[\\%_,()*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {UserQuery} q
 * @returns {Promise<{ rows: AdminUser[], hasMore: boolean }>}
 */
export async function fetchUsers(q) {
  let query = getSupabase().from('profiles').select(COLUMNS);
  const role = q.view === 'lecturers' ? 'LECTURER' : q.view === 'learners' ? 'LEARNER' : q.role;
  if (role) query = query.eq('role', role);
  if (q.status) query = query.eq('account_status', q.status);
  const term = likeTerm(q.search);
  if (term) query = query.or(`first_name.ilike.*${term}*,second_name.ilike.*${term}*,email.ilike.*${term}*`);
  query = q.sort === 'newest' ? query.order('created_at', { ascending: false }) : query.order('first_name').order('second_name');
  const from = q.page * PAGE_SIZE;
  const { data, error } = await query.range(from, from + PAGE_SIZE);
  if (error) throw error;
  const rows = /** @type {AdminUser[]} */ (data ?? []);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

/** @returns {Promise<Record<'learners' | 'lecturers' | 'admins' | 'suspended' | 'deactivated', number>>} */
export async function fetchUserCounts() {
  const supabase = getSupabase();
  /** @param {(q: any) => any} filter */
  const count = async (filter) => {
    const { count: n, error } = await filter(supabase.from('profiles').select('id', { count: 'exact', head: true }));
    if (error) throw error;
    return n ?? 0;
  };
  const [learners, lecturers, admins, suspended, deactivated] = await Promise.all([
    count((q) => q.eq('role', 'LEARNER').eq('account_status', 'ACTIVE')),
    count((q) => q.eq('role', 'LECTURER').eq('account_status', 'ACTIVE')),
    count((q) => q.eq('role', 'ADMIN').eq('account_status', 'ACTIVE')),
    count((q) => q.eq('account_status', 'SUSPENDED')),
    count((q) => q.eq('account_status', 'DEACTIVATED')),
  ]);
  return { learners, lecturers, admins, suspended, deactivated };
}
