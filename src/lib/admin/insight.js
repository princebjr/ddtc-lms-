import { cell } from '@/lib/admin/csv.js';
import { getSupabase } from '@/lib/supabase.js';

// Phase 11 (ADR-019): what the administrator's Settings, Audit logs and Reports screens and the three
// dashboards read. Every call is checked again by the database (AAL2 administrators, or the person's own).

/** @typedef {{ key: string, value: any, description: string, is_sensitive: boolean, updated_at: string }} Setting */

export async function fetchSettings() {
  const { data, error } = await getSupabase().from('system_settings').select('key, value, description, is_sensitive, updated_at').order('key');
  if (error) throw error;
  return /** @type {Setting[]} */ (data ?? []);
}

/** @param {string} key @param {any} value */
export async function saveSetting(key, value) {
  const { data, error } = await getSupabase().from('system_settings').update({ value }).eq('key', key).select('key');
  if (error) throw error;
  if (!data?.length) throw new Error('Only an administrator with two-step verification can change settings.');
}

/**
 * @typedef {object} AuditEntry
 * @property {string} id
 * @property {string} created_at
 * @property {string} action
 * @property {string} entity_type
 * @property {string | null} entity_id
 * @property {Record<string, unknown>} metadata
 * @property {string | null} actor_id
 * @property {string} actor_name
 * @property {string | null} actor_role
 */
/** @typedef {{ action?: string | null, entityType?: string | null, entityId?: string | null, from?: string | null, to?: string | null }} AuditFilters */

const auditArgs = (/** @type {AuditFilters} */ f) => ({
  p_action: f.action || undefined,
  p_entity_type: f.entityType || undefined,
  p_entity_id: f.entityId?.trim() || undefined,
  p_from: f.from || undefined,
  p_to: f.to || undefined,
});

/** @param {AuditFilters} filters @param {string | null} [before] */
export async function searchAudit(filters, before = null) {
  const { data, error } = await getSupabase().rpc('audit_log_search', { ...auditArgs(filters), p_before: before ?? undefined, p_limit: 50 });
  if (error) throw error;
  return /** @type {AuditEntry[]} */ (data ?? []);
}

export async function fetchAuditActions() {
  const { data, error } = await getSupabase().rpc('audit_log_actions');
  if (error) throw error;
  return /** @type {Array<{ action: string, entity_type: string }>} */ (data ?? []);
}

/** The filtered entries as CSV text (the export is audited by the database). @param {AuditFilters} filters */
export async function exportAudit(filters) {
  const { data, error } = await getSupabase().rpc('audit_log_export', auditArgs(filters));
  if (error) throw error;
  const rows = /** @type {AuditEntry[]} */ (data ?? []);
  return toCsv(
    ['time_utc', 'action', 'item_type', 'item_id', 'by', 'role', 'details'],
    rows.map((r) => [r.created_at, r.action, r.entity_type, r.entity_id ?? '', r.actor_name, r.actor_role ?? '', JSON.stringify(r.metadata)]),
  );
}

/** @param {string[]} header @param {Array<Array<string | number | null>>} rows */
export function toCsv(header, rows) {
  return `${[header.join(','), ...rows.map((r) => r.map((v) => cell(v === null || v === undefined ? '' : String(v))).join(','))].join('\n')}\n`;
}

/** @typedef {'enrolment' | 'activity' | 'completion' | 'grades'} ReportKind */
/** @typedef {{ course?: string | null, branch?: string | null, from?: string | null, to?: string | null }} ReportFilters */

/** @type {Record<ReportKind, { fn: string, dated: boolean }>} */
const REPORT_FN = {
  enrolment: { fn: 'report_enrolment', dated: true },
  activity: { fn: 'report_activity', dated: true },
  completion: { fn: 'report_completion', dated: false },
  grades: { fn: 'report_grades', dated: false },
};

/** @param {ReportKind} kind @param {ReportFilters} f @returns {Promise<Array<Record<string, any>>>} */
export async function fetchReport(kind, f) {
  const { fn, dated } = REPORT_FN[kind];
  const args = { p_course: f.course || null, p_branch: f.branch || null, ...(dated ? { p_from: f.from || null, p_to: f.to || null } : {}) };
  const { data, error } = await getSupabase().rpc(/** @type {any} */ (fn), args);
  if (error) throw error;
  return /** @type {any} */ (data ?? []);
}

/** Records a report download in the audit log. @param {ReportKind} kind @param {ReportFilters} f */
export async function recordReportExport(kind, f) {
  const { error } = await getSupabase().rpc('report_export_record', { p_kind: kind, p_filters: f });
  if (error) throw error;
}

/** @param {'admin_dashboard' | 'lecturer_dashboard' | 'learner_dashboard'} fn */
export async function fetchDashboard(fn) {
  const { data, error } = await getSupabase().rpc(fn);
  if (error) throw error;
  return /** @type {Record<string, any>} */ (data ?? {});
}
