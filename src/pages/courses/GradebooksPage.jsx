import { ChevronRight, ClipboardCheck, Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { ExportDialog } from '@/components/gradebook/ExportDialog.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE, fetchCourses } from '@/lib/courses/courses.js';

// Gradebooks (Phase 10; navigation page for lecturers and administrators; owner request of 2026-11-10:
// each course has its own gradebook). The published and archived courses the user may see (their own
// for a lecturer, every course for an administrator: RLS decides), each opening that course's own
// gradebook in its workspace. Export opens the course, assignment and format pickers (owner request
// 2026-11-06).

/** @typedef {Awaited<ReturnType<typeof fetchCourses>>[number]} Row */

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function GradebooksPage({ role }) {
  const admin = role === 'admin';
  const { state, data, reload } = useLoad(async () => (await fetchCourses({ withOwner: admin })).filter((c) => c.status === 'PUBLISHED' || c.status === 'ARCHIVED'), [admin]);
  const [exporting, setExporting] = useState(false);
  const rows = data ?? [];
  const open = (/** @type {Row} */ c) => `/${role}/courses/${c.id}/gradebook`;

  const columns = [
    {
      key: 'title',
      header: 'Course',
      card: /** @type {const} */ ('title'),
      cell: (/** @type {Row} */ c) => (
        <Link to={open(c)} className="text-label text-link hover:underline focus-visible:focus-ring">
          {c.title}
        </Link>
      ),
    },
    { key: 'code', header: 'Code', card: /** @type {const} */ ('secondary'), cell: (/** @type {Row} */ c) => c.course_code },
    ...(admin ? [{ key: 'owner', header: 'Lecturer', card: /** @type {const} */ ('detail'), cell: (/** @type {Row} */ c) => c.owner || '—' }] : []),
    { key: 'learners', header: 'Learners', card: /** @type {const} */ ('detail'), align: /** @type {const} */ ('end'), cell: (/** @type {Row} */ c) => c.learners },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ c) => <StatusChip tone={COURSE_STATUS_TONE[c.status]}>{COURSE_STATUS_LABEL[c.status]}</StatusChip>,
    },
    {
      key: 'open',
      header: 'Gradebook',
      card: /** @type {const} */ ('actions'),
      cell: (/** @type {Row} */ c) => (
        <Button asChild variant="outline">
          <Link to={open(c)} aria-label={`Open the gradebook of ${c.title}`}>
            Open gradebook
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={admin ? 'Gradebook oversight' : 'Gradebooks'}
        description={admin ? 'Results by course. Each course has its own gradebook.' : 'Each course you teach has its own gradebook.'}
        className="pb-0"
      />
      {/* Always visible (a header action hides below desktop width, and Export is not a FAB). */}
      <Button variant="outline" className="self-start" onClick={() => setExporting(true)} disabled={rows.length === 0}>
        <Download aria-hidden="true" />
        Export
      </Button>
      {state === 'error' ? (
        <ErrorState title="The courses could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={<ListSkeleton rows={5} columns={admin ? 5 : 4} />} onRetry={reload}>
          <ResponsiveTable
            caption="Courses and their gradebooks"
            columns={columns}
            rows={rows}
            getRowKey={(c) => c.id}
            empty={<EmptyState icon={ClipboardCheck} title="No gradebooks yet" description="A course's gradebook appears here once the course is published." />}
          />
        </LoadingRegion>
      )}
      {exporting ? <ExportDialog role={role} courses={rows} onClose={() => setExporting(false)} /> : null}
    </div>
  );
}
