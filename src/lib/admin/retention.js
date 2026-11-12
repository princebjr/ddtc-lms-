import { getSupabase } from '@/lib/supabase.js';

// Learner-audio retention for administrators (Phase 12, D20, ADR-022). Everything here is checked again by
// the database: only AAL2 administrators read holds and runs or place and release holds; the deleting
// itself is done only by the scheduled retention-runner.

/** @typedef {'SUBMISSION' | 'EXAM_ATTEMPT' | 'LEARNER' | 'COURSE'} HoldScope */
/**
 * @typedef {object} Hold
 * @property {string} id
 * @property {HoldScope} scope
 * @property {string} scope_id
 * @property {string | null} subject  the course, learner, assignment or examination
 * @property {string | null} detail  the learner, for one answer
 * @property {string} reason
 * @property {string} placed_at
 * @property {string} placed_by_name
 * @property {string | null} released_at
 * @property {string | null} released_by_name
 */
/**
 * @typedef {object} Run
 * @property {string} id
 * @property {string} started_at
 * @property {string | null} finished_at
 * @property {'DRY_RUN' | 'LIVE'} mode
 * @property {number} eligible_count
 * @property {number} deleted_count
 * @property {number} failed_count
 */
/** @typedef {{ enabled: boolean, days: number, dryRunDays: number, firstDryRun: string | null }} RetentionStatus */

/** @param {unknown} v @param {number} fallback */
const num = (v, fallback) => (typeof v === 'number' ? v : fallback);

/** The switch, the periods, when dry runs began, and the latest runs. */
export async function fetchRetention() {
  const supabase = getSupabase();
  const [settings, runs, first] = await Promise.all([
    supabase.from('system_settings').select('key, value').in('key', ['retention_enabled', 'retention_days', 'retention_dry_run_days']),
    supabase.from('retention_runs').select('id, started_at, finished_at, mode, eligible_count, deleted_count, failed_count').order('started_at', { ascending: false }).limit(10),
    supabase.from('retention_runs').select('started_at').eq('mode', 'DRY_RUN').order('started_at', { ascending: true }).limit(1),
  ]);
  for (const r of [settings, runs, first]) if (r.error) throw r.error;
  /** @type {Record<string, unknown>} */
  const v = Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value]));
  /** @type {RetentionStatus} */
  const status = { enabled: v.retention_enabled === true, days: num(v.retention_days, 180), dryRunDays: num(v.retention_dry_run_days, 30), firstDryRun: first.data?.[0]?.started_at ?? null };
  return { status, runs: /** @type {Run[]} */ (runs.data ?? []) };
}

/** Every hold, active first, with what it protects in words. @returns {Promise<Hold[]>} */
export async function fetchHolds() {
  const { data, error } = await getSupabase().rpc('retention_hold_list');
  if (error) throw error;
  return /** @type {Hold[]} */ (data ?? []);
}

/** @param {HoldScope} scope @param {string} scopeId @param {string} reason @returns {Promise<string>} the hold's id */
export async function placeHold(scope, scopeId, reason) {
  const { data, error } = await getSupabase().rpc('retention_hold_place', { p_scope: scope, p_scope_id: scopeId, p_reason: reason });
  if (error) throw error;
  return /** @type {string} */ (data);
}

/** @param {string} holdId */
export async function releaseHold(holdId) {
  const { error } = await getSupabase().rpc('retention_hold_release', { p_hold: holdId });
  if (error) throw error;
}

/**
 * One answer's id and active hold: an assignment answer (parent = the assignment) or the learner's latest
 * examination attempt (parent = the examination). Null when there is no answer.
 * @param {'SUBMISSION' | 'EXAM_ATTEMPT'} scope @param {string} parentId @param {string} learnerId
 * @returns {Promise<{ answer_id: string, hold_id: string | null, reason: string | null } | null>}
 */
export async function fetchAnswerHold(scope, parentId, learnerId) {
  const { data, error } = await getSupabase().rpc('retention_answer_hold', { p_scope: scope, p_parent: parentId, p_learner: learnerId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? /** @type {{ answer_id: string, hold_id: string | null, reason: string | null }} */ (row) : null;
}

/** Courses for the hold picker, by title. */
export async function fetchHoldCourses() {
  const { data, error } = await getSupabase().from('courses').select('id, title, course_code').order('title');
  if (error) throw error;
  return /** @type {Array<{ id: string, title: string, course_code: string }>} */ (data ?? []);
}

/** Learners whose name matches, for the hold picker (at most 20). @param {string} text */
export async function searchHoldLearners(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  let query = getSupabase().from('profiles').select('id, first_name, second_name, id_number').eq('role', 'LEARNER').order('first_name').limit(20);
  for (const w of words) {
    const safe = w.replace(/[%_,()]/g, '');
    if (safe) query = query.or(`first_name.ilike.%${safe}%,second_name.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return /** @type {Array<{ id: string, first_name: string, second_name: string, id_number: number | null }>} */ (data ?? []);
}

/**
 * When live deletion may start: dry runs must have run for dryRunDays first (ADR-022 decision 2).
 * @param {RetentionStatus} s @returns {Date | null} null before the first dry run
 */
export function liveFrom(s) {
  if (!s.firstDryRun) return null;
  return new Date(Date.parse(s.firstDryRun) + s.dryRunDays * 86_400_000);
}

/** A database refusal in plain words. @param {unknown} e */
export function holdError(e) {
  const err = /** @type {{ code?: string, message?: string }} */ (e);
  if (err?.code === '42501') return 'Only administrators with two-step verification manage holds.';
  return err?.message ?? 'Could not save. Try again.';
}
