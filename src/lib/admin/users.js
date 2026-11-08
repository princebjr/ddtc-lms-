import { parseIdNumber } from '@/lib/id-number.js';
import { getSupabase } from '@/lib/supabase.js';

// Administrator user data. Reads go through RLS (an AAL2 administrator reads every profile); every
// change goes through an Edge Function (src/lib/functions.js), except a learner's branch (D42),
// which an AAL2 administrator updates directly under RLS (the database allows nothing else).

/** @typedef {import('@/lib/database.types').Database['public']['Tables']['profiles']['Row']} ProfileRow */
/** @typedef {Pick<ProfileRow, 'id' | 'id_number' | 'first_name' | 'second_name' | 'email' | 'role' | 'account_status' | 'can_create_courses' | 'can_publish_directly' | 'profile_image_file_id' | 'created_at' | 'branch_id'> & { branch: { name: string } | null }} AdminUser */
/** @typedef {'all' | 'lecturers' | 'learners'} UsersView */

export const PAGE_SIZE = 50;
/** The branch filter's value for learners without a branch (D42). */
export const NO_BRANCH = 'none';
const COLUMNS = 'id, id_number, first_name, second_name, email, role, account_status, can_create_courses, can_publish_directly, profile_image_file_id, created_at, branch_id, branch:branches(name)';

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
 * @property {string} [branch]  '' any, NO_BRANCH for learners without one, or a branch id (D42)
 * @property {'name' | 'newest'} sort
 * @property {number} page   0-based
 */

/** Escapes characters that have a meaning in a PostgREST `or` filter or a LIKE pattern. @param {string} s */
export function likeTerm(s) {
  return s.trim().replace(/[\\%_,()*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The PostgREST `or` filter for a people search: name and email, plus the ID number when the text
 * is one (ADR-008). Null when there is nothing to search for.
 * @param {string} search
 * @returns {string | null}
 */
export function userSearchFilter(search) {
  const term = likeTerm(search);
  if (!term) return null;
  const idNumber = parseIdNumber(term);
  const text = `first_name.ilike.*${term}*,second_name.ilike.*${term}*,email.ilike.*${term}*`;
  return idNumber ? `id_number.eq.${idNumber},${text}` : text;
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
  // Only learners have a branch, so "No branch" means learners without one.
  if (q.branch === NO_BRANCH) query = query.eq('role', 'LEARNER').is('branch_id', null);
  else if (q.branch) query = query.eq('branch_id', q.branch);
  const filter = userSearchFilter(q.search);
  if (filter) query = query.or(filter);
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
