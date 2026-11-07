import { getSupabase } from '@/lib/supabase.js';

// Learner branches (D42). The names live only in the `branches` table, never in the code. The list is
// read once and kept for the session (it changes rarely); after a failure the next request reads it
// again, and sign-out forgets it.

/** @typedef {{ id: string, name: string, position: number, is_active: boolean }} Branch */

/** @type {Promise<Branch[]> | null} */
let cached = null;

/** @returns {Promise<Branch[]>} */
async function load() {
  const { data, error } = await getSupabase().from('branches').select('id, name, position, is_active').order('position');
  if (error) throw error;
  return data ?? [];
}

/**
 * Every branch, open or closed, in DDTC's order.
 * @returns {Promise<Branch[]>}
 */
export function fetchBranches() {
  if (!cached) {
    const request = load();
    cached = request;
    request.catch(() => {
      if (cached === request) cached = null;
    });
  }
  return cached;
}

/** Forgets the list (sign-out, D43; tests). */
export function clearBranches() {
  cached = null;
}

/**
 * The branches a learner can choose: the open ones in DDTC's order, plus their current branch if it
 * has closed since, so that saving other changes never clears it.
 * @param {readonly Branch[]} branches
 * @param {string | null | undefined} currentId
 * @returns {Branch[]}
 */
export function branchChoices(branches, currentId) {
  return branches.filter((b) => b.is_active || b.id === currentId);
}

/**
 * The name shown for a branch in a list (a closed branch says so).
 * @param {Branch} branch
 */
export function branchLabel(branch) {
  return branch.is_active ? branch.name : `${branch.name} (closed)`;
}
