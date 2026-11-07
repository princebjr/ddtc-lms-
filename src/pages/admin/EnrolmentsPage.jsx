import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { Fab } from '@/components/feedback/Fab.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Sheet, SheetContent } from '@/components/ui/sheet.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useAvatarUrl } from '@/hooks/use-avatar-url.js';
import { useLoad } from '@/hooks/use-load.js';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { ENROLMENT_STATUS_LABEL, ENROLMENT_STATUS_TONE, fetchCourses } from '@/lib/courses/courses.js';
import { enrolLearners, fetchEnrolments, restoreEnrolments, searchLearners, setEnrolmentStatus } from '@/lib/courses/enrolments.js';
import { formatIdNumber } from '@/lib/id-number.js';

// Enrolment management (D05, prototype `enr`): administrator only. Filter by course, status or
// learner; change a status (COMPLETED marks a finished learner, read-only access) with Undo; Enrol
// learners (choose a course, pick learners) with Undo. CSV enrolment is in Users, Import CSV.

/** @typedef {import('@/lib/courses/enrolments.js').EnrolmentRow} EnrolmentRow */
/** @typedef {import('@/lib/courses/courses.js').EnrolmentStatus} EnrolmentStatus */

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });

export default function EnrolmentsPage() {
  const toast = useToast();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [params, setParams] = useSearchParams();
  const courseId = params.get('course') ?? '';
  const [status, setStatus] = useState(/** @type {'' | EnrolmentStatus} */ (''));
  const [search, setSearch] = useState('');
  const [searchText, setSearchText] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchText(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const courses = useLoad(() => fetchCourses({ limit: 500 }), []);
  const list = useLoad(() => fetchEnrolments({ courseId, status, search: searchText }), [courseId, status, searchText]);
  const openCourses = (courses.data ?? []).filter((c) => c.status !== 'ARCHIVED');

  /** @param {EnrolmentRow} row @param {EnrolmentStatus} next */
  const change = async (row, next) => {
    try {
      const changes = await setEnrolmentStatus([row.id], next);
      list.setData((rows) => rows.map((r) => (r.id === row.id ? { ...r, enrolment_status: next } : r)));
      toast.show('admin.enrolment-updated', {
        onAction: async () => {
          await restoreEnrolments(changes);
          list.reload();
        },
      });
    } catch {
      toast.show('request.failed', { onAction: () => change(row, next) });
    }
  };

  const columns = [
    { key: 'learner', header: 'Learner', card: /** @type {const} */ ('title'), cell: (/** @type {EnrolmentRow} */ r) => <Learner row={r} /> },
    { key: 'course', header: 'Course', card: /** @type {const} */ ('secondary'), cell: (/** @type {EnrolmentRow} */ r) => `${r.course.title} (${r.course.course_code})` },
    {
      key: 'status',
      header: 'Status',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {EnrolmentRow} */ r) => <StatusChip tone={ENROLMENT_STATUS_TONE[r.enrolment_status]}>{ENROLMENT_STATUS_LABEL[r.enrolment_status]}</StatusChip>,
    },
    { key: 'enrolled', header: 'Enrolled', card: /** @type {const} */ ('detail'), cell: (/** @type {EnrolmentRow} */ r) => dateFormat.format(new Date(r.enrolled_at)) },
    {
      key: 'change',
      header: 'Change status',
      align: /** @type {const} */ ('end'),
      card: /** @type {const} */ ('detail'),
      cell: (/** @type {EnrolmentRow} */ r) => (
        <Select value={r.enrolment_status} onValueChange={(v) => v !== r.enrolment_status && change(r, /** @type {EnrolmentStatus} */ (v))}>
          <SelectTrigger className="sm:w-40" aria-label={`Status for ${r.learner.first_name} ${r.learner.second_name} in ${r.course.course_code}, currently ${ENROLMENT_STATUS_LABEL[r.enrolment_status]}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ENROLMENT_STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Enrolments"
        description="Who is enrolled in which course"
        actions={
          desktop ? (
            <Button onClick={() => setEnrolling(true)}>
              <Plus aria-hidden="true" />
              Enrol learners
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-64">
          <Label htmlFor="enrolment-search">Search learners</Label>
          <Input id="enrolment-search" type="search" inputMode="search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2 sm:w-64">
          <Label htmlFor="enrolment-course">Course</Label>
          <Select value={courseId || 'any'} onValueChange={(v) => setParams(v === 'any' ? {} : { course: v }, { replace: true })}>
            <SelectTrigger id="enrolment-course" aria-label="Course">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All courses</SelectItem>
              {(courses.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title} ({c.course_code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:w-44">
          <Label htmlFor="enrolment-status">Status</Label>
          <Select value={status || 'any'} onValueChange={(v) => setStatus(v === 'any' ? '' : /** @type {EnrolmentStatus} */ (v))}>
            <SelectTrigger id="enrolment-status" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {Object.entries(ENROLMENT_STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.state === 'error' ? (
        <ErrorState title="The enrolments could not be loaded" onRetry={list.reload} />
      ) : (
        <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={8} columns={5} />} onRetry={list.reload}>
          <ResponsiveTable
            caption="Enrolments"
            columns={columns}
            rows={list.data ?? []}
            getRowKey={(r) => r.id}
            empty={<EmptyState title={courseId || status || searchText ? 'No enrolments match these filters' : 'No enrolments yet'} />}
          />
        </LoadingRegion>
      )}

      <Fab label="Enrol learners" onClick={() => setEnrolling(true)} allowed />
      {enrolling ? (
        <EnrolSheet
          courses={openCourses}
          initialCourse={openCourses.some((c) => c.id === courseId) ? courseId : ''}
          onClose={() => setEnrolling(false)}
          onDone={(ids) => {
            setEnrolling(false);
            list.reload();
            toast.show('admin.learners-enrolled', {
              params: { n: String(ids.length) },
              onAction: async () => {
                await setEnrolmentStatus(ids, 'WITHDRAWN');
                list.reload();
              },
            });
          }}
        />
      ) : null}
    </div>
  );
}

/** @param {{ row: EnrolmentRow }} props */
function Learner({ row }) {
  const imageUrl = useAvatarUrl(row.learner.profile_image_file_id);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <UserAvatar firstName={row.learner.first_name} secondName={row.learner.second_name} imageUrl={imageUrl} size={40} decorative />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-label text-ink">
          {row.learner.first_name} {row.learner.second_name}
        </span>
        <span className="truncate text-body-sm text-ink-secondary">{row.learner.email}</span>
      </span>
    </span>
  );
}

/**
 * Choose a course, pick learners, enrol. Already-enrolled learners are skipped by the server.
 * @param {{ courses: import('@/lib/courses/courses.js').CourseSummary[], initialCourse: string, onClose: () => void, onDone: (enrolmentIds: string[]) => void }} props
 */
function EnrolSheet({ courses, initialCourse, onClose, onDone }) {
  const [course, setCourse] = useState(initialCourse);
  const [search, setSearch] = useState('');
  const [searchText, setSearchText] = useState('');
  const [picked, setPicked] = useState(/** @type {Map<string, string>} */ (new Map()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    const t = setTimeout(() => setSearchText(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const learners = useLoad(() => searchLearners(searchText), [searchText]);

  /** @param {{ id: string, first_name: string, second_name: string }} l @param {boolean} on */
  const toggle = (l, on) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(l.id, `${l.first_name} ${l.second_name}`);
      else next.delete(l.id);
      return next;
    });

  const submit = async () => {
    setMessage(null);
    if (!course) return setMessage('Choose a course');
    if (!picked.size) return setMessage('Choose at least one learner');
    setBusy(true);
    try {
      const res = await enrolLearners(course, [...picked.keys()]);
      if (!res.enrolled.length) return setMessage('Everyone you chose is already enrolled in this course.');
      onDone(res.enrolled);
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent title="Enrol learners" description="Learners see the course once it is published.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="enrol-course">Course</Label>
            <Select value={course || undefined} onValueChange={setCourse}>
              <SelectTrigger id="enrol-course" aria-label="Course">
                <SelectValue placeholder="Choose a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title} ({c.course_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="enrol-search">Find learners</Label>
            <Input id="enrol-search" type="search" inputMode="search" placeholder="Name, email or ID number" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <LoadingRegion loading={learners.state === 'loading'} skeleton={<ListSkeleton rows={4} columns={2} />} onRetry={learners.reload}>
            <ul className="m-0 flex max-h-80 list-none flex-col divide-y divide-hairline overflow-y-auto rounded-md border border-hairline p-0">
              {(learners.data ?? []).map((l) => (
                <li key={l.id} className="flex min-h-14 items-center gap-3 px-3">
                  <Checkbox id={`pick-${l.id}`} checked={picked.has(l.id)} onCheckedChange={(v) => toggle(l, v === true)} />
                  <Label htmlFor={`pick-${l.id}`} className="flex min-w-0 flex-1 flex-col py-2">
                    <span className="truncate text-label text-ink">
                      {l.first_name} {l.second_name}
                    </span>
                    <span className="truncate text-body-sm text-ink-secondary">
                      {l.email} · ID <span className="tabular-nums">{formatIdNumber(l.id_number)}</span>
                    </span>
                  </Label>
                </li>
              ))}
              {learners.state === 'ready' && !(learners.data ?? []).length ? <li className="p-4 text-body-sm text-ink-secondary">No learner matches.</li> : null}
            </ul>
          </LoadingRegion>
          <p className="m-0 text-body-sm text-ink-secondary">{picked.size ? `${picked.size} chosen: ${[...picked.values()].slice(0, 3).join(', ')}${picked.size > 3 ? '…' : ''}` : 'No one chosen yet.'}</p>
          <FormMessage>{message}</FormMessage>
          <Button onClick={submit} loading={busy} loadingLabel="Enrolling">
            Enrol {picked.size || ''} {picked.size === 1 ? 'learner' : 'learners'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
