import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchAllAssignments } from '@/lib/assignments/assignments.js';
import { formatDue } from '@/lib/assignments/due.js';

// Assignment oversight for administrators (prototype `asg`; Phase 7): every assignment across the
// courses with its course, due date and status; each opens in the course's assignment editor.

/** @typedef {Awaited<ReturnType<typeof fetchAllAssignments>>[number]} Row */

export default function AdminAssignmentsPage() {
  const list = useLoad(fetchAllAssignments, []);
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (a) =>
      !query ||
      a.title.toLowerCase().includes(query) ||
      (a.course?.title ?? '').toLowerCase().includes(query) ||
      (a.course?.course_code ?? '').toLowerCase().includes(query),
  );

  const columns = [
    {
      key: 'title',
      header: 'Assignment',
      card: /** @type {const} */ ('title'),
      cell: (/** @type {Row} */ a) => (
        <span className="flex min-w-0 flex-col">
          <Link to={`/admin/courses/${a.course_id}/assignments/${a.id}`} className="truncate text-label text-link hover:underline focus-visible:focus-ring">
            {a.title}
          </Link>
          <span className="truncate text-caption text-ink-secondary">
            {a.course?.title ?? ''} ({a.course?.course_code ?? ''})
          </span>
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Due (Ghana time)',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ a) => <span className="tabular-nums">{formatDue(a.due_at)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ a) =>
        a.archived_at ? (
          <StatusChip tone="neutral">Archived</StatusChip>
        ) : a.publication_status === 'PUBLISHED' ? (
          <StatusChip tone="success">Published</StatusChip>
        ) : (
          <StatusChip tone="neutral">Draft</StatusChip>
        ),
    },
    // Phase 8: the learners' answers (administrators read every course's).
    {
      key: 'submissions',
      header: 'Submissions',
      card: /** @type {const} */ ('detail'),
      align: /** @type {const} */ ('end'),
      cell: (/** @type {Row} */ a) =>
        a.publication_status === 'PUBLISHED' || a.archived_at ? (
          <Link
            to={`/admin/courses/${a.course_id}/assignments/${a.id}/submissions`}
            className="inline-flex min-h-11 items-center text-label text-link hover:underline focus-visible:focus-ring"
            aria-label={`Submissions for ${a.title}`}
          >
            Submissions
          </Link>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Assignment oversight" description="All assignments." />
      <div className="flex max-w-md flex-col gap-2">
        <Label htmlFor="assignment-search">Search</Label>
        <Input
          id="assignment-search"
          type="search"
          inputMode="search"
          placeholder="Assignment or course"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {list.state === 'error' ? (
        <ErrorState title="The assignments could not be loaded" onRetry={list.reload} />
      ) : (
        <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={6} columns={3} />} onRetry={list.reload}>
          <ResponsiveTable
            caption="All assignments"
            columns={columns}
            rows={rows}
            getRowKey={(a) => a.id}
            empty={<EmptyState icon={ClipboardList} title={query ? 'No assignment matches' : 'No assignments yet'} />}
          />
        </LoadingRegion>
      )}
    </div>
  );
}
