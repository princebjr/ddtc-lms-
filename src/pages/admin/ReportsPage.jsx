import { Download, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { downloadText } from '@/lib/admin/csv.js';
import { fetchReport, recordReportExport, toCsv } from '@/lib/admin/insight.js';
import { fetchBranches } from '@/lib/branches.js';
import { fetchCourses } from '@/lib/courses/courses.js';
import { formatPercentage } from '@/lib/grading/grading.js';

// Reports (Phase 11, ADR-019; D42): enrolment, activity, completion and grade summaries, by course and
// branch, filtered by course, branch and (for enrolment and activity) dates. Grade summaries use released
// course grades only (the one formula, D13). Download CSV records the download in the audit log. Each
// assignment's own performance report is the gradebook export (Phase 10).

/** @typedef {import('@/lib/admin/insight.js').ReportKind} ReportKind */
/** @typedef {import('@/lib/admin/insight.js').ReportFilters} ReportFilters */

/** @type {Record<ReportKind, { label: string, dated: boolean, columns: Array<[string, string, (v: any) => string]> }>} */
const REPORTS = {
  enrolment: {
    label: 'Enrolment',
    dated: true,
    columns: [
      ['active', 'Active', String],
      ['completed', 'Completed', String],
      ['suspended', 'Suspended', String],
      ['withdrawn', 'Withdrawn', String],
      ['enrolled_in_period', 'Enrolled in period', String],
    ],
  },
  activity: {
    label: 'Activity',
    dated: true,
    columns: [
      ['learners', 'Learners', String],
      ['active_learners', 'Active in period', String],
      ['answers_sent', 'Answers sent', String],
      ['exam_scripts', 'Exam scripts', String],
      ['lessons_completed', 'Lessons completed', String],
    ],
  },
  completion: {
    label: 'Completion',
    dated: false,
    columns: [
      ['learners', 'Learners', String],
      ['lessons', 'Lessons', String],
      ['average_progress', 'Average progress', (v) => (v === null ? '—' : formatPercentage(Number(v)))],
      ['completed_all', 'Completed all lessons', String],
    ],
  },
  grades: {
    label: 'Grade summaries',
    dated: false,
    columns: [
      ['learners', 'Learners', String],
      ['graded', 'With a course grade', String],
      ['average_percentage', 'Average course grade', (v) => (v === null ? '—' : formatPercentage(Number(v)))],
      ['passed', 'Passed', String],
    ],
  },
};
const KINDS = /** @type {ReportKind[]} */ (Object.keys(REPORTS));
const dayStart = (/** @type {string} */ day, add = 0) => {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString();
};

export default function ReportsPage() {
  const [kind, setKind] = useState(/** @type {ReportKind} */ ('enrolment'));
  const [form, setForm] = useState({ course: '', branch: '', from: '', to: '' });
  const [filters, setFilters] = useState(/** @type {ReportFilters} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const lists = useLoad(() => Promise.all([fetchCourses({}), fetchBranches()]), []);
  const report = useLoad(() => fetchReport(kind, filters), [kind, filters]);
  const spec = REPORTS[kind];
  const rows = report.data ?? [];

  const apply = (/** @type {import('react').FormEvent} */ e) => {
    e.preventDefault();
    if (form.from && form.to && form.to < form.from) {
      setMessage('The end date is before the start date.');
      return;
    }
    setMessage(null);
    setFilters({ course: form.course || null, branch: form.branch || null, from: dayStart(form.from), to: dayStart(form.to, 1) });
  };
  const download = async () => {
    try {
      await recordReportExport(kind, filters);
      const csv = toCsv(
        ['course_code', 'course', 'branch', ...spec.columns.map(([k]) => k)],
        rows.map((r) => [r.course_code, r.course_title, r.branch_name ?? 'No branch', ...spec.columns.map(([k]) => r[k])]),
      );
      downloadText(`ddtc-${kind}-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } catch {
      setMessage('The report could not be downloaded. Try again.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="By course and branch. Times are Ghana time."
        actions={
          <Button variant="outline" onClick={() => void download()} disabled={report.state !== 'ready' || !rows.length}>
            <Download aria-hidden="true" />
            Download CSV
          </Button>
        }
      />
      <Card className="p-0">
        <form className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" onSubmit={apply} aria-label="Filter the report">
          <div className="flex flex-col gap-1 lg:col-span-2">
            <Label htmlFor="r-course">Course</Label>
            <NativeSelect id="r-course" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
              <option value="">All courses</option>
              {(lists.data?.[0] ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.course_code} ${c.title}`}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="r-branch">Branch</Label>
            <NativeSelect id="r-branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
              <option value="">All branches</option>
              {(lists.data?.[1] ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="r-from">From</Label>
            <Input id="r-from" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="r-to">To</Label>
            <Input id="r-to" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-5">
            <Button type="submit">
              <Search aria-hidden="true" />
              Show report
            </Button>
          </div>
        </form>
      </Card>
      <FormMessage>{message}</FormMessage>
      <Tabs value={kind} onValueChange={(v) => setKind(/** @type {ReportKind} */ (v))}>
        <TabsList aria-label="Reports" className="max-w-full overflow-x-auto">
          {KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {REPORTS[k].label}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((k) => (
          <TabsContent key={k} value={k} className="mt-4 flex flex-col gap-3">
            {!REPORTS[k].dated && (filters.from || filters.to) ? (
              <p className="m-0 text-body-sm text-ink-secondary">This report is for all time; the dates do not apply.</p>
            ) : null}
            {k === 'grades' ? (
              <p className="m-0 text-body-sm text-ink-secondary">
                Released course grades only. For one assignment&apos;s results, download its report from the{' '}
                <Link to="/admin/gradebooks" className="text-link underline focus-visible:focus-ring">
                  gradebook
                </Link>
                .
              </p>
            ) : null}
            {k === kind ? (
              <LoadingRegion
                loading={report.state === 'loading'}
                skeleton={<ListSkeleton rows={6} columns={spec.columns.length + 2} />}
                label="Loading the report"
              >
                {report.state === 'error' ? (
                  <ErrorState onRetry={report.reload} />
                ) : /** @type {any} */ (report.data)?.paused ? (
                  <EmptyState title="Reports are paused" description="DDTC has paused reports for now. Turn them on again on Settings, Heavy features." />
                ) : rows.length === 0 ? (
                  <EmptyState title="Nothing to report" description="No learners match these filters." />
                ) : (
                  <ReportTable rows={rows} spec={spec} />
                )}
              </LoadingRegion>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/** A table on wider screens, cards on phones. @param {{ rows: Array<Record<string, any>>, spec: (typeof REPORTS)[ReportKind] }} props */
function ReportTable({ rows, spec }) {
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden" aria-label={`${spec.label} by course and branch`}>
        {rows.map((r) => (
          <li key={`${r.course_id}-${r.branch_name}`} className="rounded-md border border-hairline bg-card p-4" data-testid="report-row">
            <p className="m-0 text-body text-ink">{r.course_title}</p>
            <p className="m-0 text-body-sm text-ink-secondary">{`${r.course_code} · ${r.branch_name ?? 'No branch'}`}</p>
            <dl className="m-0 mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {spec.columns.map(([k, label, show]) => (
                <div key={k} className="flex flex-col">
                  <dt className="text-caption text-ink-secondary">{label}</dt>
                  <dd className="m-0 text-body-sm text-ink">{show(r[k])}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-md border border-hairline bg-card md:block">
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">{`${spec.label} by course and branch`}</caption>
          <thead className="bg-fill text-left text-ink-secondary">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Course
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Branch
              </th>
              {spec.columns.map(([k, label]) => (
                <th key={k} scope="col" className="px-4 py-3 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.course_id}-${r.branch_name}`} className="border-t border-hairline" data-testid="report-row">
                <th scope="row" className="px-4 py-3 text-left font-normal text-ink">
                  <span className="block">{r.course_title}</span>
                  <span className="text-ink-secondary">{r.course_code}</span>
                </th>
                <td className="px-4 py-3 text-ink">{r.branch_name ?? 'No branch'}</td>
                {spec.columns.map(([k, , show]) => (
                  <td key={k} className="px-4 py-3 text-right tabular-nums text-ink">
                    {show(r[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
