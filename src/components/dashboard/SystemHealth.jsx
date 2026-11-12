import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { getSupabase } from '@/lib/supabase.js';

// System health on the administrator dashboard (Phase 13; no error-reporting service, ADR-023): what the
// daily health check finds now (system_health, AAL2 administrators only): failed scheduled jobs or calls,
// files that keep failing removal, failed emails, retention problems, and missing, failed or stale backups.
// The same issues reach every administrator once a day as an alert in Notifications.

/** @typedef {{ key: string, severity: 'warning' | 'error', title: string, message: string }} Issue */

async function fetchHealth() {
  const { data, error } = await getSupabase().rpc('system_health');
  if (error) throw error;
  return /** @type {Issue[]} */ (data ?? []);
}

export function SystemHealth() {
  const page = useLoad(fetchHealth, []);
  if (page.state !== 'ready') return null;
  const issues = page.data ?? [];
  return (
    <Card as="section" aria-labelledby="system-health-heading" className="flex flex-col gap-3" data-slot="system-health">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="system-health-heading">System health</CardTitle>
        {issues.length ? (
          <StatusChip tone={issues.some((i) => i.severity === 'error') ? 'error' : 'warning'}>{`${issues.length} to look at`}</StatusChip>
        ) : (
          <StatusChip tone="success">All good</StatusChip>
        )}
      </div>
      {issues.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {issues.map((i) => (
            <li key={i.key} className="flex items-start gap-3">
              <TriangleAlert className={i.severity === 'error' ? 'mt-0.5 size-5 shrink-0 text-error' : 'mt-0.5 size-5 shrink-0 text-warning'} aria-hidden="true" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body text-ink">{i.title}</span>
                <span className="break-words text-body-sm text-ink-secondary">{i.message}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <CardDescription className="flex items-center gap-2">
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          Scheduled jobs, emails, retention and backups are working.
        </CardDescription>
      )}
    </Card>
  );
}
