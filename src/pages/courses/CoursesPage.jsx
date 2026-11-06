import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { CourseCard, courseStatusChip } from '@/components/courses/CourseCard.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { Fab } from '@/components/feedback/Fab.jsx';
import { CourseCardsSkeleton, ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { useCourseCovers } from '@/hooks/use-course-covers.js';
import { useLoad } from '@/hooks/use-load.js';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE, fetchCourses } from '@/lib/courses/courses.js';

// Course lists (Phase 5). Administrator: Course oversight (prototype `crs`): search, status filter,
// ResponsiveTable (cards on phones), New course. Lecturer: My Courses (prototype `lcrs`): course
// cards, and New course only for a lecturer allowed to create courses (UI_FEEDBACK FAB table).

/** @typedef {import('@/lib/courses/courses.js').CourseSummary} CourseSummary */

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function CoursesPage({ role }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const admin = role === 'admin';
  const canCreate = admin || Boolean(auth.profile?.can_create_courses);
  const [search, setSearch] = useState('');
  const [searchText, setSearchText] = useState('');
  const [status, setStatus] = useState(/** @type {'' | import('@/lib/courses/courses.js').CourseStatus} */ (''));

  useEffect(() => {
    const t = setTimeout(() => setSearchText(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { state, data, reload } = useLoad(() => fetchCourses({ search: searchText, status, withOwner: admin }), [searchText, status, admin]);
  const rows = data ?? [];
  const newCourse = () => navigate(`/${role}/courses/new`);
  const base = `/${role}/courses`;

  const columns = [
    {
      key: 'course',
      header: 'Course',
      card: /** @type {const} */ ('title'),
      cell: (/** @type {CourseSummary} */ c) => (
        <Link to={`${base}/${c.id}`} className="flex min-h-11 min-w-0 flex-col justify-center hover:underline focus-visible:focus-ring">
          <span className="truncate text-label text-ink">{c.title}</span>
          <span className="truncate text-body-sm text-ink-secondary">{c.course_code}</span>
        </Link>
      ),
    },
    { key: 'owner', header: 'Lecturer', card: /** @type {const} */ ('secondary'), cell: (/** @type {CourseSummary} */ c) => c.owner || 'No owner' },
    { key: 'learners', header: 'Learners', card: /** @type {const} */ ('detail'), cell: (/** @type {CourseSummary} */ c) => `${c.learners} learners` },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {CourseSummary} */ c) => <StatusChip tone={COURSE_STATUS_TONE[c.status]}>{COURSE_STATUS_LABEL[c.status]}</StatusChip>,
    },
    { key: 'updated', header: 'Updated', card: /** @type {const} */ ('detail'), cell: (/** @type {CourseSummary} */ c) => dateFormat.format(new Date(c.updated_at)) },
  ];

  const filtered = searchText || status;
  const empty = (
    <EmptyState
      title={filtered ? 'No course matches these filters' : admin ? 'No courses yet' : 'You do not teach any course yet'}
      description={filtered ? undefined : canCreate ? 'Create the first course to get started.' : 'An administrator adds you to courses.'}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={admin ? 'Courses' : 'My Courses'}
        description={admin ? 'Every course, its lecturer and its status' : 'Courses you teach'}
        actions={
          desktop && canCreate ? (
            <Button onClick={newCourse}>
              <Plus aria-hidden="true" />
              New course
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor="course-search">Search</Label>
          <Input id="course-search" type="search" inputMode="search" placeholder="Title or code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2 sm:w-52">
          <Label htmlFor="course-status">Status</Label>
          <Select value={status || 'any'} onValueChange={(v) => setStatus(v === 'any' ? '' : /** @type {any} */ (v))}>
            <SelectTrigger id="course-status" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {Object.entries(COURSE_STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {state === 'error' ? (
        <ErrorState title="The courses could not be loaded" onRetry={reload} />
      ) : (
        <LoadingRegion loading={state === 'loading'} skeleton={admin ? <ListSkeleton rows={8} columns={5} /> : <CourseCardsSkeleton />} onRetry={reload}>
          {admin ? (
            <ResponsiveTable caption="Courses" columns={columns} rows={rows} getRowKey={(c) => c.id} empty={empty} />
          ) : (
            <LecturerCards rows={rows} base={base} empty={empty} />
          )}
        </LoadingRegion>
      )}

      <Fab label="New course" onClick={newCourse} allowed={canCreate} />
    </div>
  );
}

/** @param {{ rows: CourseSummary[], base: string, empty: import('react').ReactNode }} props */
function LecturerCards({ rows, base, empty }) {
  const covers = useCourseCovers(rows.map((c) => c.id));
  if (!rows.length) return <>{empty}</>;
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((c) => (
        <li key={c.id}>
          <CourseCard
            to={`${base}/${c.id}`}
            title={c.title}
            code={c.course_code}
            coverUrl={covers[c.id]}
            chips={[courseStatusChip(c.status), ...(c.status === 'PUBLISHED' || c.status === 'ARCHIVED' ? [{ label: `${c.learners} learners` }] : [])]}
          />
        </li>
      ))}
    </ul>
  );
}
