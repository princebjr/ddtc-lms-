import { ArrowLeft, CalendarClock, Eye, PenLine, Send, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BranchFilter } from '@/components/branches/BranchFilter.jsx';
import { FilterSelect } from '@/components/data/FilterSelect.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { LoadingRegion, ResultsSkeleton } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PracticalMarkSheet } from '@/components/gradebook/PracticalMarkSheet.jsx';
import { LearnerCell } from '@/components/grading/LearnerCell.jsx';
import { ReleaseAllDialog } from '@/components/grading/ReleaseAllDialog.jsx';
import { ResultCounts } from '@/components/grading/ResultCounts.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { ExtensionDialog } from '@/components/submissions/ExtensionDialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Sheet, SheetContent } from '@/components/ui/sheet.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { TABLET_UP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { NO_BRANCH } from '@/lib/admin/users.js';
import { fetchAssignment, fetchAssignmentPart } from '@/lib/assignments/assignments.js';
import { formatDue, formatDueShort } from '@/lib/assignments/due.js';
import { fetchBranches } from '@/lib/branches.js';
import { fetchCourse } from '@/lib/courses/courses.js';
import { fetchAssignmentResults, fetchPracticalMarks, formatPercentage, formatScore, gradeState, isSet } from '@/lib/grading/grading.js';
import { BranchGroups, GroupByBranchSwitch } from '@/components/branches/BranchGroups.jsx';
import { useGroupByBranch } from '@/lib/branch-groups.js';

// An assignment's submissions and results for its course's lecturers and administrators (Phase 8 list,
// grading and results added in Phase 9; DESIGN.md 13 results table; D13, D16, D42; owner decisions 4
// and 5): the counts (from the database, adding up to the enrolled total), search by name or ID
// number, filters by result and branch, sorting, and every learner with their branch chip, result,
// score and grade state; Grade opens the grading screen; Release grades releases every draft grade
// after a confirmation; Extension sets, changes or takes back one learner's extension. A withdrawn
// learner who had sent an answer is listed and marked, but not counted.

/** @typedef {import('@/lib/grading/grading.js').ResultRow} Row */

const RESULT = /** @type {const} */ ({
  GRADED: { label: 'Graded', tone: 'success' },
  UNGRADED: { label: 'Ungraded', tone: 'info' },
  MISSING: { label: 'Missing', tone: 'error' },
  NOT_YET_DUE: { label: 'Not yet due', tone: 'neutral' },
});

const FILTERS = /** @type {Array<[string, string]>} */ ([
  ['', 'All learners'],
  ['UNGRADED', 'Ungraded'],
  ['DRAFT', 'Draft grades'],
  ['RELEASED', 'Released'],
  ['MISSING', 'Missing'],
  ['NOT_YET_DUE', 'Not yet due'],
  ['LATE', 'Late'],
]);
const SORTS = /** @type {Array<[string, string]>} */ ([
  ['name', 'Name'],
  ['score-high', 'Score, highest first'],
  ['score-low', 'Score, lowest first'],
  ['latest', 'Latest answer first'],
]);

/** @param {Row} r @param {string} filter */
function matches(r, filter) {
  switch (filter) {
    case 'UNGRADED':
    case 'MISSING':
    case 'NOT_YET_DUE':
      return r.result === filter;
    case 'DRAFT':
      return r.result === 'GRADED' && r.grade_release_status === 'DRAFT';
    case 'RELEASED':
      return r.result === 'GRADED' && r.grade_release_status === 'RELEASED';
    case 'LATE':
      return Boolean(r.submission_id && r.is_late);
    default:
      return true;
  }
}

const byName = (/** @type {Row} */ a, /** @type {Row} */ b) => `${a.first_name} ${a.second_name}`.localeCompare(`${b.first_name} ${b.second_name}`, 'en-GB');

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function AssignmentSubmissionsPage({ role }) {
  const { courseId = '', assignmentId = '' } = useParams();
  const page = useLoad(async () => {
    const [course, assignment, results, part] = await Promise.all([
      fetchCourse(courseId),
      fetchAssignment(assignmentId),
      fetchAssignmentResults(assignmentId),
      fetchAssignmentPart(assignmentId),
    ]);
    // A practical is marked in person (Phase 10.1, ADR-016): the page is its mark sheet.
    const marks = part === 'PRACTICALS' ? await fetchPracticalMarks(assignmentId) : [];
    return { course, assignment, ...results, part, marks };
  }, [courseId, assignmentId]);
  const [extending, setExtending] = useState(/** @type {Row | null} */ (null));
  const [releasing, setReleasing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [branch, setBranch] = useState('');
  const [sort, setSort] = useState('name');
  // Grouped by branch unless switched off (Phase 10.1; owner answer of 2026-11-10).
  const [grouped, setGrouped] = useGroupByBranch();
  // BranchFilter gives a branch id (or NO_BRANCH); the rows carry the branch name.
  const branches = useLoad(fetchBranches, []);
  const branchName = branch && branch !== NO_BRANCH ? (branches.data?.find((b) => b.id === branch)?.name ?? null) : null;

  const allRows = page.data?.rows;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = (allRows ?? []).filter(
      (r) =>
        matches(r, filter) &&
        (!branch || (branch === NO_BRANCH ? !r.branch_name : r.branch_name === branchName)) &&
        (!q || `${r.first_name} ${r.second_name}`.toLowerCase().includes(q) || (digits.length >= 3 && String(r.id_number ?? '').includes(digits))),
    );
    const score = (/** @type {Row} */ r) => (!isSet(r.score) ? null : Number(r.score));
    return [...list].sort((a, b) => {
      if (sort === 'score-high' || sort === 'score-low') {
        const [x, y] = [score(a), score(b)];
        if (!isSet(x) || !isSet(y)) return !isSet(x) && !isSet(y) ? byName(a, b) : !isSet(x) ? 1 : -1;
        return (sort === 'score-high' ? y - x : x - y) || byName(a, b);
      }
      if (sort === 'latest') {
        const [x, y] = [a.submitted_at ? Date.parse(a.submitted_at) : 0, b.submitted_at ? Date.parse(b.submitted_at) : 0];
        return y - x || byName(a, b);
      }
      return byName(a, b);
    });
  }, [allRows, search, filter, branch, branchName, sort]);

  if (page.state === 'error') return <ErrorState title="The submissions could not be loaded" onRetry={page.reload} />;
  const d = page.data;
  if (page.state === 'ready' && (!d?.course || !d?.assignment || d.assignment.course_id !== courseId)) {
    return <EmptyState title="Assignment not found" description="It may have been moved, or you do not teach this course." />;
  }
  const a = d?.assignment;
  const archived = d?.course?.status === 'ARCHIVED' || Boolean(a?.archived_at);
  const drafts = (allRows ?? []).filter((r) => r.result === 'GRADED' && r.grade_release_status === 'DRAFT').length;
  const filtered = Boolean(search.trim() || filter || branch);

  const columns = [
    { key: 'learner', header: 'Learner', card: /** @type {const} */ ('title'), cell: (/** @type {Row} */ r) => <LearnerCell row={r} /> },
    {
      key: 'result',
      header: 'Result',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {Row} */ r) => (
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap gap-2">
            <ResultChip row={r} />
            {r.submission_id && r.is_late ? <StatusChip tone="warning">Late</StatusChip> : null}
            {!r.counted ? <StatusChip>Withdrawn</StatusChip> : null}
          </span>
          {!r.submission_id ? (
            <span className="whitespace-nowrap text-caption text-ink-secondary tabular-nums">
              Due {formatDueShort(r.effective_due_at)}
              {r.extended_due_at ? ' (extended)' : ''}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ r) => {
        if (!isSet(r.score)) return '—';
        return (
          <span className="whitespace-nowrap tabular-nums text-ink">
            {formatScore(r.score, r.max_marks)}
            {isSet(r.percentage) ? <span className="text-ink-secondary"> · {formatPercentage(r.percentage)}</span> : null}
            {r.letter_grade ? <span className="text-ink-secondary"> · {r.letter_grade}</span> : null}
          </span>
        );
      },
    },
    {
      key: 'sent',
      header: 'Latest answer',
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {Row} */ r) =>
        r.submitted_at ? (
          <span className="flex flex-col whitespace-nowrap tabular-nums">
            <span>Version {r.current_version}</span>
            <span className="text-ink-secondary">{formatDueShort(r.submitted_at)}</span>
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      card: /** @type {const} */ ('actions'),
      align: /** @type {const} */ ('end'),
      cell: (/** @type {Row} */ r) => {
        const name = `${r.first_name} ${r.second_name}`;
        const toGrade = r.result === 'UNGRADED';
        return (
          <span className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
            {r.submission_id ? (
              <Button asChild variant={toGrade && !archived ? 'primary' : 'outline'}>
                <Link to={`/${role}/courses/${courseId}/assignments/${assignmentId}/submissions/${r.learner_id}`} aria-label={`${toGrade && !archived ? 'Grade' : 'View'} answer from ${name}`}>
                  {toGrade && !archived ? <PenLine aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  {toGrade && !archived ? 'Grade' : 'View answer'}
                </Link>
              </Button>
            ) : null}
            {!archived && r.enrolment_status === 'ACTIVE' ? (
              <Button type="button" variant="ghost" onClick={() => setExtending(r)} aria-label={`Extension for ${name}`}>
                <CalendarClock aria-hidden="true" />
                Extension
              </Button>
            ) : null}
          </span>
        );
      },
    },
  ];

  return (
    <LoadingRegion loading={page.state === 'loading'} skeleton={<ResultsSkeleton />} onRetry={page.reload}>
      {d?.course && a ? (
        <div className="flex flex-col gap-4">
          <Link
            to={`/${role}/courses/${courseId}/assignments`}
            className="inline-flex min-h-11 items-center gap-1 self-start text-label text-link hover:underline focus-visible:focus-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {d.course.title}
          </Link>
          {d.part === 'PRACTICALS' ? (
            <>
              <PageHeader
                title={`Marks: ${a.title}`}
                description={`Local Assembly practical, marked in person on ${formatDue(a.due_at)} (Ghana time). Out of ${Number(a.max_marks)} marks.`}
                className="pb-0"
              />
              <PracticalMarkSheet
                key={JSON.stringify(d.marks)}
                assignmentId={a.id}
                maxMarks={Number(a.max_marks)}
                rows={d.rows}
                current={d.marks}
                readOnly={archived}
                onSaved={page.reload}
              />
            </>
          ) : (
            <>
          <PageHeader
            title={`Submissions: ${a.title}`}
            description={`Due ${formatDue(a.due_at)} (Ghana time). Out of ${Number(a.max_marks)} marks.`}
            className="pb-0"
          />
          {/* In the page, not the header: header actions show only on wide screens, and Release must be reachable on every device. */}
          {!archived && drafts > 0 ? (
            <Button type="button" className="self-start" onClick={() => setReleasing(true)}>
              <Send aria-hidden="true" />
              Release grades ({drafts})
            </Button>
          ) : null}
          {d.counts ? <ResultCounts counts={d.counts} /> : null}
          {d.counts && d.counts.withdrawn_submitted ? (
            <p className="m-0 text-body-sm text-ink-secondary">
              {d.counts.withdrawn_submitted} withdrawn {d.counts.withdrawn_submitted === 1 ? 'learner' : 'learners'} sent an answer before leaving the course: listed,
              not counted.
            </p>
          ) : null}
          <Filters search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} branch={branch} onBranch={setBranch} sort={sort} onSort={setSort} />
          <GroupByBranchSwitch on={grouped} onChange={setGrouped} />
          <BranchGroups rows={rows} on={grouped && rows.length > 0}>
            {(group, branchName) => (
          <ResponsiveTable
            caption={branchName ? `Submissions for ${a.title}, ${branchName}` : `Submissions for ${a.title}`}
            // Five columns with stacked actions do not fit a tablet: cards up to 1024 px.
            cardsBelow="lg"
            columns={columns}
            rows={group}
            getRowKey={(r) => r.learner_id}
            empty={
              filtered ? (
                <EmptyState title="No learners match these filters" description="Try another search or filter." />
              ) : (
                <EmptyState title="No learners yet" description="Learners appear here once an administrator enrols them in the course." />
              )
            }
          />
            )}
          </BranchGroups>
          {extending ? (
            <ExtensionDialog
              assignmentId={assignmentId}
              learner={{ id: extending.learner_id, name: `${extending.first_name} ${extending.second_name}` }}
              dueAt={a.due_at}
              extendedTo={extending.extended_due_at}
              onClose={() => setExtending(null)}
              onChanged={page.reload}
            />
          ) : null}
          {releasing ? <ReleaseAllDialog assignmentId={assignmentId} drafts={drafts} onClose={() => setReleasing(false)} onReleased={page.reload} /> : null}
            </>
          )}
        </div>
      ) : null}
    </LoadingRegion>
  );
}

/**
 * Search inline; filters inline from tablet width, in a bottom sheet on phones (as on the Users page).
 * @param {{ search: string, onSearch: (v: string) => void, filter: string, onFilter: (v: string) => void,
 *   branch: string, onBranch: (v: string) => void, sort: string, onSort: (v: string) => void }} props
 */
function Filters({ search, onSearch, filter, onFilter, branch, onBranch, sort, onSort }) {
  const wide = useMediaQuery(TABLET_UP_QUERY);
  const [open, setOpen] = useState(false);
  const active = Number(Boolean(filter)) + Number(Boolean(branch)) + Number(sort !== 'name');
  const fields = (
    <>
      <FilterSelect label="Show" id="results-filter" value={filter} onChange={onFilter} options={FILTERS} />
      <BranchFilter id="results-branch" value={branch} onChange={onBranch} />
      <FilterSelect label="Sort" id="results-sort" value={sort} onChange={onSort} options={SORTS} />
    </>
  );
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-64">
        <Label htmlFor="results-search">Search</Label>
        <Input id="results-search" type="search" inputMode="search" placeholder="Name or ID number" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      {wide ? (
        fields
      ) : (
        <>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <SlidersHorizontal aria-hidden="true" />
            Filters{active ? ` (${active})` : ''}
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent title="Filters">
              <div className="flex flex-col gap-4">
                {fields}
                <Button onClick={() => setOpen(false)}>Show results</Button>
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

/**
 * One chip for where the learner stands: for a graded or reopened answer the grade's state (Released,
 * Draft grade, Changed, not released, Reopened), otherwise Ungraded, Missing or Not yet due.
 * @param {{ row: Row }} props
 */
function ResultChip({ row }) {
  const { label, tone } = row.result === 'GRADED' || row.status === 'REOPENED' ? gradeState(row) : RESULT[row.result];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}
