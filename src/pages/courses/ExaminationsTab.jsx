import { FileCheck2, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue } from '@/lib/assignments/due.js';
import { examStatus, fetchCourseExams } from '@/lib/exams/exams.js';

// The course's Examinations tab for its lecturers and administrators (Phase 10.1, ADR-016; owner request
// of 2026-11-10): every examination with when it opens and closes (Ghana time) and where it stands,
// New examination, and for each one its editor and its results. Examinations count in the Final
// examinations part of the course grade. An archived course is read-only.

/** @typedef {import('@/lib/exams/exams.js').ExamRow} Row */

/** @param {{ role: 'admin' | 'lecturer', courseId: string, archived: boolean }} props */
export function ExaminationsTab({ role, courseId, archived }) {
  const list = useLoad(() => fetchCourseExams(courseId), [courseId]);
  const base = `/${role}/courses/${courseId}/exams`;

  const columns = [
    {
      key: 'title',
      header: 'Examination',
      card: /** @type {const} */ ('title'),
      cell: (/** @type {Row} */ x) => (
        <Link to={`${base}/${x.id}`} className="text-label text-link hover:underline focus-visible:focus-ring">
          {x.title}
        </Link>
      ),
    },
    {
      key: 'opens',
      header: 'Opens (Ghana time)',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ x) => <span className="tabular-nums">{formatDue(x.opens_at)}</span>,
    },
    {
      key: 'closes',
      header: 'Closes (Ghana time)',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ x) => <span className="tabular-nums">{formatDue(x.closed_at ?? x.closes_at)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ x) => {
        const s = examStatus(x);
        return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
      },
    },
    {
      key: 'results',
      header: 'Results',
      card: /** @type {const} */ ('actions'),
      cell: (/** @type {Row} */ x) =>
        x.publication_status === 'PUBLISHED' ? (
          <Button asChild variant="outline">
            <Link to={`${base}/${x.id}/results`} aria-label={`Results of ${x.title}`}>
              Results
            </Link>
          </Button>
        ) : null,
    },
  ];

  if (list.state === 'error') return <ErrorState title="The examinations could not be loaded" onRetry={list.reload} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-body text-ink-secondary">Examinations count in the Final examinations part of the course grade. There is no time limit: only the deadline.</p>
        {archived ? null : (
          <Button asChild>
            <Link to={`${base}/new`}>
              <Plus aria-hidden="true" />
              New examination
            </Link>
          </Button>
        )}
      </div>
      <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={3} columns={5} />} onRetry={list.reload}>
        <ResponsiveTable
          caption="Examinations"
          columns={columns}
          rows={list.data ?? []}
          getRowKey={(x) => x.id}
          empty={<EmptyState icon={FileCheck2} title="No examinations yet" description="Set an end-of-course examination with multiple-choice, short-answer and essay questions." />}
        />
      </LoadingRegion>
    </div>
  );
}
