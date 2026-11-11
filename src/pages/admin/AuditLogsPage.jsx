import { Download, Search } from 'lucide-react';
import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { downloadText } from '@/lib/admin/csv.js';
import { exportAudit, fetchAuditActions, searchAudit } from '@/lib/admin/insight.js';
import { formatDue } from '@/lib/assignments/due.js';

// Audit logs (Phase 11, ADR-019): who did what, and when, for administrators with two-step verification
// (the database refuses everyone else). Filters by action, item type, item ID and dates (Ghana days; Ghana
// time is UTC); newest first, 50 at a time; each entry's details. Download CSV gives the filtered entries,
// and the download itself is recorded in the log (owner answer 6 of 2026-11-10).

/** @typedef {import('@/lib/admin/insight.js').AuditEntry} AuditEntry */
/** @typedef {import('@/lib/admin/insight.js').AuditFilters} AuditFilters */

/** A Ghana calendar day as the start of that day in UTC (Ghana time is UTC+0). @param {string} day @param {number} [addDays] */
const dayStart = (day, addDays = 0) => {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString();
};

export default function AuditLogsPage() {
  const [form, setForm] = useState({ action: '', entityType: '', entityId: '', from: '', to: '' });
  /** @type {[AuditFilters, (f: AuditFilters) => void]} */
  const [filters, setFilters] = useState(/** @type {AuditFilters} */ ({}));
  const options = useLoad(fetchAuditActions, []);
  const page = useLoad(async () => {
    const rows = await searchAudit(filters);
    return { rows, more: rows.length === 50 };
  }, [filters]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  const actions = [...new Set((options.data ?? []).map((o) => o.action))];
  const types = [...new Set((options.data ?? []).map((o) => o.entity_type))].sort();
  const rows = page.data?.rows ?? [];

  const apply = (/** @type {import('react').FormEvent} */ e) => {
    e.preventDefault();
    if (form.from && form.to && form.to < form.from) {
      setMessage('The end date is before the start date.');
      return;
    }
    setMessage(null);
    setFilters({ action: form.action, entityType: form.entityType, entityId: form.entityId, from: dayStart(form.from), to: dayStart(form.to, 1) });
  };
  const more = async () => {
    setBusy(true);
    try {
      const next = await searchAudit(filters, rows[rows.length - 1]?.created_at ?? null);
      page.setData((d) => ({ rows: [...d.rows, ...next], more: next.length === 50 }));
    } catch {
      setMessage('More entries could not be loaded. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      downloadText(`ddtc-audit-log-${new Date().toISOString().slice(0, 10)}.csv`, await exportAudit(filters));
    } catch {
      setMessage('The audit log could not be downloaded. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit logs"
        description="Who did what, and when. Times are Ghana time."
        actions={
          <Button variant="outline" onClick={() => void download()} disabled={busy || page.state !== 'ready'}>
            <Download aria-hidden="true" />
            Download CSV
          </Button>
        }
      />
      <Card className="p-0">
        <form className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={apply} aria-label="Filter the audit log">
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-action">Action</Label>
            <NativeSelect id="f-action" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-type">Item type</Label>
            <NativeSelect id="f-type" value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
              <option value="">All items</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-id">Item ID</Label>
            <Input id="f-id" value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} placeholder="Optional" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-from">From</Label>
            <Input id="f-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-to">To</Label>
            <Input id="f-to" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full sm:w-auto">
              <Search aria-hidden="true" />
              Show entries
            </Button>
          </div>
        </form>
      </Card>
      <FormMessage>{message}</FormMessage>
      <LoadingRegion loading={page.state === 'loading'} skeleton={<ListSkeleton rows={8} columns={4} />} label="Loading the audit log">
        {page.state === 'error' ? (
          <ErrorState onRetry={page.reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No entries" description="Nothing in the audit log matches these filters." />
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Audit entries">
              {rows.map((r) => (
                <li key={r.id} data-testid="audit-entry">
                  <details className="rounded-md border border-hairline bg-card">
                    <summary className="flex min-h-14 cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 focus-visible:focus-ring">
                      <span className="font-mono text-body-sm text-ink">{r.action}</span>
                      <span className="text-body-sm text-ink-secondary">
                        {r.actor_name}
                        {r.actor_role ? ` (${r.actor_role.toLowerCase()})` : ''}
                      </span>
                      <span className="text-body-sm text-ink-secondary sm:ml-auto">{formatDue(r.created_at)}</span>
                    </summary>
                    <div className="flex flex-col gap-2 border-t border-hairline px-4 py-3 text-body-sm">
                      <p className="m-0 break-all text-ink-secondary">
                        {r.entity_type}
                        {r.entity_id ? `: ${r.entity_id}` : ''}
                      </p>
                      <pre className="m-0 overflow-x-auto rounded-sm bg-fill p-2 font-mono text-caption whitespace-pre-wrap break-all text-ink">
                        {JSON.stringify(r.metadata, null, 2)}
                      </pre>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            {page.data?.more ? (
              <Button variant="outline" className="self-center" onClick={() => void more()} disabled={busy}>
                Show more
              </Button>
            ) : null}
          </>
        )}
      </LoadingRegion>
    </div>
  );
}
