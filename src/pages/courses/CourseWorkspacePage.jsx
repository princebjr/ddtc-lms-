import { BookOpen, ChartColumn, ClipboardCheck, ClipboardList, ImageUp, Trash2, UserMinus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { ResponsiveTable } from '@/components/data/ResponsiveTable.jsx';
import { ConfirmDeleteDialog } from '@/components/feedback/ConfirmDeleteDialog.jsx';
import { CourseWorkspaceSkeleton, ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useCourseCovers } from '@/hooks/use-course-covers.js';
import { useLoad } from '@/hooks/use-load.js';
import { useMediaDelete } from '@/hooks/use-media-delete.js';
import { useProfileImage } from '@/hooks/use-profile-image.js';
import { validate } from '@/lib/auth/schemas.js';
import {
  changeLecturer,
  COURSE_STATUS_LABEL,
  COURSE_STATUS_TONE,
  ENROLMENT_STATUS_LABEL,
  ENROLMENT_STATUS_TONE,
  fetchActiveLecturers,
  fetchCourse,
  fetchRoster,
  fetchTeachers,
  saveCourseDetails,
  transitionCourse,
} from '@/lib/courses/courses.js';
import { courseSchema, returnReasonSchema } from '@/lib/courses/schemas.js';
import { callFunction } from '@/lib/functions.js';
import { formatIdNumber } from '@/lib/id-number.js';
import { getStorage } from '@/lib/storage.js';
import { TextArea } from './CourseEditorPage.jsx';
import { LessonsTab } from './LessonsTab.jsx';

// The course workspace for lecturers and administrators (prototype `lcw`): course title bar with the
// lifecycle actions (D04, ADR-005), then the tabs Overview, Lessons, Assignments, Learners,
// Gradebook, Analytics and Settings. Lessons, Assignments, Gradebook and Analytics arrive in later
// phases. An ARCHIVED course is read-only (D07): no editing, no FAB, only Restore.

/** @typedef {import('@/lib/courses/courses.js').Course} Course */
/** @typedef {import('@/lib/courses/courses.js').Teacher} Teacher */

const TABS = /** @type {const} */ ([
  { slug: 'overview', label: 'Overview' },
  { slug: 'lessons', label: 'Lessons' },
  { slug: 'assignments', label: 'Assignments' },
  { slug: 'learners', label: 'Learners' },
  { slug: 'gradebook', label: 'Gradebook' },
  { slug: 'analytics', label: 'Analytics' },
  { slug: 'settings', label: 'Settings' },
]);

const LATER = {
  assignments: { phase: 7, icon: ClipboardList, title: 'Assignments' },
  gradebook: { phase: 10, icon: ClipboardCheck, title: 'Gradebook' },
  analytics: { phase: 10, icon: ChartColumn, title: 'Analytics' },
};

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const COVER_MAX = 2 * 1024 * 1024;

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function CourseWorkspacePage({ role }) {
  const { courseId = '', tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const admin = role === 'admin';
  const course = useLoad(async () => {
    const [c, teachers] = await Promise.all([fetchCourse(courseId), fetchTeachers(courseId)]);
    return { course: c, teachers };
  }, [courseId]);
  const current = TABS.some((t) => t.slug === tab) ? tab : 'overview';

  if (course.state === 'error') return <ErrorState title="The course could not be loaded" onRetry={course.reload} />;
  if (course.state === 'ready' && !course.data?.course) {
    return <EmptyState icon={BookOpen} title="Course not found" description="It may not exist, or you do not teach it." />;
  }

  const c = course.data?.course ?? null;
  const teachers = course.data?.teachers ?? [];
  const myPermission = teachers.find((t) => t.lecturer_id === auth.profile?.id)?.permission_level ?? null;
  const isOwner = myPermission === 'OWNER';
  const archived = c?.status === 'ARCHIVED';
  const canEdit = !archived && (admin || myPermission !== null);

  return (
    <LoadingRegion loading={course.state === 'loading'} skeleton={<CourseWorkspaceSkeleton />} onRetry={course.reload}>
      {c ? (
        <div className="flex flex-col gap-6">
          <CourseHeader
            course={c}
            teachers={teachers}
            admin={admin}
            isOwner={isOwner}
            onChanged={(status) => course.setData((d) => ({ ...d, course: d.course ? { ...d.course, status } : d.course }))}
            reload={course.reload}
          />
          <Tabs value={current} onValueChange={(v) => navigate(`/${role}/courses/${courseId}/${v}`, { replace: true })}>
            <TabsList aria-label="Course sections">
              {TABS.map((t) => (
                <TabsTrigger key={t.slug} value={t.slug}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {/* Only the active section is rendered; it is the tab panel its tab points to. */}
            <TabsContent value={current}>
              {current === 'overview' ? <OverviewTab course={c} canEdit={canEdit} onSaved={course.reload} /> : null}
              {current === 'lessons' ? <LessonsTab role={role} courseId={c.id} archived={archived} isLecturer={myPermission !== null} /> : null}
              {current === 'learners' ? <LearnersTab course={c} admin={admin} /> : null}
              {current === 'settings' ? <SettingsTab course={c} teachers={teachers} admin={admin} isOwner={isOwner} reload={course.reload} /> : null}
              {current in LATER ? <Later which={/** @type {keyof typeof LATER} */ (current)} /> : null}
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </LoadingRegion>
  );
}

/** @param {{ which: keyof typeof LATER }} props */
function Later({ which }) {
  const l = LATER[which];
  return <EmptyState icon={l.icon} title={`${l.title} arrive in Phase ${l.phase}`} description="This part of the course is not built yet." />;
}

/**
 * Title bar: name, code, status, and the actions this person may take now.
 * @param {{ course: Course, teachers: Teacher[], admin: boolean, isOwner: boolean, onChanged: (s: Course['status']) => void, reload: () => void }} props
 */
function CourseHeader({ course, teachers, admin, isOwner, onChanged, reload }) {
  const toast = useToast();
  const auth = useAuth();
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [dialog, setDialog] = useState(/** @type {null | 'approve' | 'return'} */ (null));
  const owner = teachers.find((t) => t.permission_level === 'OWNER');
  const direct = Boolean(auth.profile?.can_publish_directly);

  /**
   * @param {'submit' | 'publish' | 'approve' | 'return' | 'archive' | 'unarchive'} action
   * @param {{ reason?: string, grantDirect?: boolean }} [options]
   */
  const run = async (action, options) => {
    setBusy(action);
    setMessage(null);
    try {
      const status = await transitionCourse(course.id, action, options);
      onChanged(status);
      if (action === 'submit') toast.show(status === 'PUBLISHED' ? 'lecturer.course-published' : 'lecturer.submitted-for-approval');
      if (action === 'publish' || action === 'approve') toast.show('admin.course-approved');
      if (action === 'return') toast.show('admin.course-returned');
      if (action === 'archive') toast.show('admin.course-archived', { onAction: () => run('unarchive') });
      if (action === 'unarchive') reload();
      return true;
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const s = course.status;
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={course.title}
        description={owner ? `${course.course_code} · ${owner.first_name} ${owner.second_name}` : course.course_code}
      />
      <span>
        <StatusChip tone={COURSE_STATUS_TONE[s]}>{COURSE_STATUS_LABEL[s]}</StatusChip>
      </span>
      {/* At every width: PageHeader actions are desktop-only (the desktop form of a FAB), and these
          are the course's main lifecycle actions. Full width on phones, inline from 640 px. */}
      <div className="flex flex-col gap-2 empty:hidden sm:flex-row sm:flex-wrap">
            {!admin && s === 'DRAFT' ? (
              <Button onClick={() => run('submit')} loading={busy === 'submit'} loadingLabel="Sending">
                {direct ? 'Publish' : 'Submit for approval'}
              </Button>
            ) : null}
            {admin && s === 'PENDING_APPROVAL' ? (
              <>
                <Button variant="outline" onClick={() => setDialog('return')}>
                  Return
                </Button>
                <Button onClick={() => setDialog('approve')}>Approve</Button>
              </>
            ) : null}
            {admin && s === 'DRAFT' ? (
              <Button onClick={() => run('publish')} loading={busy === 'publish'} loadingLabel="Publishing">
                Publish
              </Button>
            ) : null}
            {s === 'ARCHIVED' && (admin || isOwner) ? (
              <Button variant="outline" onClick={() => run('unarchive')} loading={busy === 'unarchive'} loadingLabel="Restoring">
                Restore course
              </Button>
            ) : null}
          </div>
      {s === 'DRAFT' && course.return_reason ? (
        <p role="status" className="m-0 rounded-md status-tint-warning p-4 text-body-sm text-ink">
          Returned by an administrator: {course.return_reason}
        </p>
      ) : null}
      {s === 'ARCHIVED' ? (
        <p role="status" className="m-0 rounded-md bg-fill p-4 text-body-sm text-ink-secondary">
          This course is archived. It is read-only; learners keep access to what they had.
        </p>
      ) : null}
      <FormMessage>{message}</FormMessage>

      <ApproveDialog
        open={dialog === 'approve'}
        lecturer="the lecturer who sent it"
        busy={busy === 'approve'}
        onClose={() => setDialog(null)}
        onApprove={async (grantDirect) => {
          if (await run('approve', { grantDirect })) setDialog(null);
        }}
      />
      <ReturnDialog
        open={dialog === 'return'}
        busy={busy === 'return'}
        onClose={() => setDialog(null)}
        onReturn={async (reason) => {
          if (await run('return', { reason })) setDialog(null);
        }}
      />
    </div>
  );
}

/**
 * Approve, optionally letting the lecturer publish without approval from now on (ADR-005).
 * @param {{ open: boolean, lecturer: string, busy: boolean, onClose: () => void, onApprove: (grantDirect: boolean) => void }} props
 */
export function ApproveDialog({ open, lecturer, busy, onClose, onApprove }) {
  const [grant, setGrant] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve and publish?</DialogTitle>
          <DialogDescription>Enrolled learners will see the course straight away.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3">
          <Checkbox id="grant-direct" checked={grant} onCheckedChange={(v) => setGrant(v === true)} />
          <Label htmlFor="grant-direct" className="leading-normal">
            Let {lecturer} publish without approval from now on
          </Label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onApprove(grant)} loading={busy} loadingLabel="Approving">
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** @param {{ open: boolean, busy: boolean, onClose: () => void, onReturn: (reason: string) => void }} props */
export function ReturnDialog({ open, busy, onClose, onReturn }) {
  const [error, setError] = useState(/** @type {string | null} */ (null));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return to the lecturer?</DialogTitle>
          <DialogDescription>The course goes back to draft. Tell the lecturer what to change.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const result = returnReasonSchema.safeParse(String(new FormData(e.currentTarget).get('reason') ?? ''));
            if (!result.success) return setError(result.error.issues[0]?.message ?? 'Give a reason');
            setError(null);
            onReturn(result.data);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="return-reason">Reason</Label>
            <Textarea id="return-reason" name="reason" rows={4} aria-invalid={error ? true : undefined} aria-describedby={error ? 'return-reason-error' : undefined} />
            {error ? (
              <p id="return-reason-error" className="m-0 text-body-sm text-error">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} loadingLabel="Returning">
              Return course
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Details and cover. @param {{ course: Course, canEdit: boolean, onSaved: () => void }} props */
function OverviewTab({ course, canEdit, onSaved }) {
  const toast = useToast();
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [pending, setPending] = useState(false);

  /** @param {import('react').FormEvent<HTMLFormElement>} e */
  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    const result = validate(courseSchema, formValues(e.currentTarget));
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setPending(true);
    try {
      await saveCourseDetails(course.id, result.data);
      toast.show('lecturer.draft-saved');
      onSaved();
    } catch (error) {
      const code = /** @type {{ code?: string }} */ (error).code;
      setMessage(code === '23505' ? 'A course with this code already exists' : 'The course could not be saved. Try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormField label="Course title" name="title" defaultValue={course.title} disabled={!canEdit} error={errors.title} autoComplete="off" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Course code" name="courseCode" defaultValue={course.course_code} disabled={!canEdit} error={errors.courseCode} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            <FormField label="Category" name="category" defaultValue={course.category} disabled={!canEdit} error={errors.category} autoComplete="off" />
          </div>
          <TextArea label="Description" name="description" defaultValue={course.description} disabled={!canEdit} error={errors.description} />
          <TextArea label="Learning objectives" name="learningObjectives" defaultValue={course.learning_objectives} disabled={!canEdit} error={errors.learningObjectives} />
          <FormMessage>{message}</FormMessage>
          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" loading={pending} loadingLabel="Saving">
                Save changes
              </Button>
            </div>
          ) : null}
        </form>
      </Card>
      <CoverCard course={course} canEdit={canEdit} onChanged={onSaved} />
    </div>
  );
}

/**
 * Course cover through the D18 pipeline; Remove (ADR-007) deletes the file and the course falls back
 * to the placeholder everywhere.
 * @param {{ course: Course, canEdit: boolean, onChanged: () => void }} props
 */
export function CoverCard({ course, canEdit, onChanged }) {
  const covers = useCourseCovers(course.cover_image_file_id ? [course.id] : []);
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(/** @type {null | { tone: 'error' | 'success', text: string }} */ (null));
  const url = course.cover_image_file_id ? covers[course.id] : undefined;
  const remover = useMediaDelete({ kind: 'course-cover', onDeleted: () => onChanged() });

  /** @param {File} file */
  const upload = async (file) => {
    setNote(null);
    if (!COVER_TYPES.includes(file.type)) return setNote({ tone: 'error', text: 'Use a JPG, PNG or WebP image.' });
    if (file.size > COVER_MAX) return setNote({ tone: 'error', text: 'Use an image of 2 MB or less.' });
    setBusy(true);
    try {
      const reg = /** @type {{ bucket: string, path: string, token: string, fileId: string }} */ (
        await callFunction('register-upload', { resourceType: 'COURSE_COVER', courseId: course.id, filename: file.name, size: file.size })
      );
      const storage = await getStorage();
      const { error } = await storage.from(reg.bucket).uploadToSignedUrl(reg.path, reg.token, file, { contentType: file.type });
      if (error) throw new Error('The image could not be uploaded. Try again.');
      await callFunction('finalize-upload', { fileId: reg.fileId });
      setNote({ tone: 'success', text: 'Cover updated' });
      onChanged();
    } catch (error) {
      setNote({ tone: 'error', text: /** @type {Error} */ (error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Cover image</CardTitle>
      <div className="aspect-video w-full overflow-hidden rounded-md bg-fill">
        {url ? (
          <img src={url} alt={`Cover of ${course.title}`} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-hero-soft text-link">
            <BookOpen className="size-10" aria-hidden="true" />
          </span>
        )}
      </div>
      <CardDescription>JPG, PNG or WebP, up to 2 MB.</CardDescription>
      {canEdit ? (
        <>
          <input
            ref={input}
            type="file"
            accept={COVER_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          {/* Stacked: the cover card is narrow beside the details on desktop, and full width on phones. */}
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => input.current?.click()} loading={busy} loadingLabel="Uploading">
              <ImageUp aria-hidden="true" />
              {course.cover_image_file_id ? 'Replace cover' : 'Upload cover image'}
            </Button>
            {course.cover_image_file_id ? (
              <Button variant="outline" className="text-error" onClick={() => remover.ask({ id: course.id, name: course.title })} disabled={busy}>
                <Trash2 aria-hidden="true" />
                Remove cover image
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      <FormMessage tone={note?.tone}>{note?.text}</FormMessage>
      <ConfirmDeleteDialog
        state={remover}
        title="Remove this cover image?"
        description={() => 'The course will show the standard placeholder instead. This cannot be undone.'}
        confirmLabel="Remove"
      />
    </Card>
  );
}

/** Learners by name, photo and ID number only (course_roster, ADR-008). @param {{ course: Course, admin: boolean }} props */
function LearnersTab({ course, admin }) {
  const roster = useLoad(() => fetchRoster(course.id), [course.id]);
  /** @typedef {Awaited<ReturnType<typeof fetchRoster>>[number]} RosterRow */
  const columns = [
    { key: 'name', header: 'Learner', card: /** @type {const} */ ('title'), cell: (/** @type {RosterRow} */ r) => <RosterPerson row={r} /> },
    {
      key: 'idNumber',
      header: 'ID number',
      card: /** @type {const} */ ('secondary'),
      cell: (/** @type {RosterRow} */ r) => <span className="tabular-nums">{formatIdNumber(r.id_number)}</span>,
    },
    {
      key: 'status',
      header: 'Enrolment',
      card: /** @type {const} */ ('status'),
      cell: (/** @type {RosterRow} */ r) => <StatusChip tone={ENROLMENT_STATUS_TONE[r.enrolment_status]}>{ENROLMENT_STATUS_LABEL[r.enrolment_status]}</StatusChip>,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-body-sm text-ink-secondary">Learners are enrolled by an administrator.</p>
        {admin && course.status !== 'ARCHIVED' ? (
          <Button asChild variant="outline">
            <Link to={`/admin/enrolments?course=${course.id}`}>Manage enrolments</Link>
          </Button>
        ) : null}
      </div>
      {roster.state === 'error' ? (
        <ErrorState title="The learners could not be loaded" onRetry={roster.reload} />
      ) : (
        <LoadingRegion loading={roster.state === 'loading'} skeleton={<ListSkeleton rows={5} columns={2} />} onRetry={roster.reload}>
          <ResponsiveTable
            caption="Learners"
            columns={columns}
            rows={roster.data ?? []}
            getRowKey={(r) => r.enrolment_id}
            empty={<EmptyState title="No learners yet" description="Learners appear here once an administrator enrols them." />}
          />
        </LoadingRegion>
      )}
    </div>
  );
}

/** @param {{ row: { first_name: string, second_name: string, profile_image_path: string | null } }} props */
function RosterPerson({ row }) {
  const imageUrl = useProfileImage(row.profile_image_path);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <UserAvatar firstName={row.first_name} secondName={row.second_name} imageUrl={imageUrl} size={40} decorative />
      <span className="truncate text-label text-ink">
        {row.first_name} {row.second_name}
      </span>
    </span>
  );
}

/**
 * Lecturers (D06) and archiving.
 * @param {{ course: Course, teachers: Teacher[], admin: boolean, isOwner: boolean, reload: () => void }} props
 */
function SettingsTab({ course, teachers, admin, isOwner, reload }) {
  const toast = useToast();
  const archived = course.status === 'ARCHIVED';
  const manage = (admin || isOwner) && !archived;
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const [confirmArchive, setConfirmArchive] = useState(false);
  const lecturers = useLoad(() => (admin ? fetchActiveLecturers() : Promise.resolve([])), [admin]);
  const [newOwner, setNewOwner] = useState('');
  const [coLecturer, setCoLecturer] = useState('');

  /** @param {string} key @param {() => Promise<void>} work */
  const act = async (key, work) => {
    setBusy(key);
    setMessage(null);
    try {
      await work();
      reload();
      return true;
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  /** @param {Teacher} t */
  const remove = (t) =>
    act(`remove-${t.lecturer_id}`, async () => {
      await changeLecturer(course.id, { lecturerId: t.lecturer_id }, 'remove');
      toast.show('lecturer.co-lecturer-removed', { onAction: () => act('undo', async () => void (await changeLecturer(course.id, { lecturerId: t.lecturer_id }, 'add'))) });
    });

  /** @param {import('react').FormEvent<HTMLFormElement>} e */
  const addCo = async (e) => {
    e.preventDefault();
    const raw = String(new FormData(e.currentTarget).get('coLecturerEmail') ?? '').trim();
    const who = admin ? (coLecturer ? { lecturerId: coLecturer } : null) : raw ? { lecturerEmail: raw } : null;
    if (!who) return setMessage(admin ? 'Choose a lecturer' : 'Enter the lecturer’s email address');
    const form = e.currentTarget;
    const ok = await act('add', async () => {
      const id = await changeLecturer(course.id, who, 'add');
      toast.show('lecturer.co-lecturer-added', { onAction: () => act('undo', async () => void (await changeLecturer(course.id, { lecturerId: id }, 'remove'))) });
    });
    if (ok) {
      form.reset();
      setCoLecturer('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <CardTitle>Lecturers</CardTitle>
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
          {teachers.map((t) => (
            <li key={t.lecturer_id} className="flex min-h-14 items-center gap-3 py-2">
              <TeacherAvatar teacher={t} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-label text-ink">
                  {t.first_name} {t.second_name}
                </span>
                <span className="text-body-sm text-ink-secondary">{t.permission_level === 'OWNER' ? 'Owner' : 'Co-lecturer'}</span>
              </span>
              {manage && t.permission_level === 'CO_LECTURER' ? (
                <Button variant="ghost" onClick={() => remove(t)} loading={busy === `remove-${t.lecturer_id}`} loadingLabel="Removing" aria-label={`Remove ${t.first_name} ${t.second_name}`}>
                  <UserMinus aria-hidden="true" />
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {manage ? (
          <form noValidate onSubmit={addCo} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {admin ? (
              <LecturerPicker id="co-lecturer" label="Add a co-lecturer" value={coLecturer} onChange={setCoLecturer} options={(lecturers.data ?? []).filter((l) => !teachers.some((t) => t.lecturer_id === l.id))} />
            ) : (
              <div className="flex-1">
                <FormField label="Add a co-lecturer by email" name="coLecturerEmail" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} />
              </div>
            )}
            <Button type="submit" variant="outline" loading={busy === 'add'} loadingLabel="Adding">
              Add co-lecturer
            </Button>
          </form>
        ) : null}
        {!admin && !isOwner ? <CardDescription>Only the course owner or an administrator can change lecturers.</CardDescription> : null}
      </Card>

      {admin && !archived ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>Transfer ownership</CardTitle>
          <CardDescription>The current owner stays on the course as a co-lecturer.</CardDescription>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <LecturerPicker id="new-owner" label="New owner" value={newOwner} onChange={setNewOwner} options={(lecturers.data ?? []).filter((l) => !teachers.some((t) => t.lecturer_id === l.id && t.permission_level === 'OWNER'))} />
            <Button
              variant="outline"
              disabled={!newOwner}
              loading={busy === 'transfer'}
              loadingLabel="Transferring"
              onClick={() =>
                act('transfer', async () => {
                  await changeLecturer(course.id, { lecturerId: newOwner }, 'transfer');
                  setNewOwner('');
                  toast.show('admin.owner-changed');
                })
              }
            >
              Transfer
            </Button>
          </div>
        </Card>
      ) : null}

      {(admin || isOwner) && !archived ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>Archive course</CardTitle>
          <CardDescription>The course becomes read-only and leaves active lists. Nothing is deleted: learners keep their lessons and released grades.</CardDescription>
          <span>
            <Button variant="destructive" onClick={() => setConfirmArchive(true)}>
              Archive course
            </Button>
          </span>
        </Card>
      ) : null}
      <FormMessage>{message}</FormMessage>

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {course.title}?</DialogTitle>
            <DialogDescription>It becomes read-only. You can restore it later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={busy === 'archive'}
              loadingLabel="Archiving"
              onClick={async () => {
                const ok = await act('archive', async () => {
                  await transitionCourse(course.id, 'archive');
                  toast.show('admin.course-archived', { onAction: () => act('undo', async () => void (await transitionCourse(course.id, 'unarchive'))) });
                });
                if (ok) setConfirmArchive(false);
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** @param {{ teacher: Teacher }} props */
function TeacherAvatar({ teacher }) {
  const imageUrl = useProfileImage(teacher.profile_image_path);
  return <UserAvatar firstName={teacher.first_name} secondName={teacher.second_name} imageUrl={imageUrl} size={40} decorative />;
}

/**
 * @param {{ id: string, label: string, value: string, onChange: (v: string) => void, options: Array<{ id: string, first_name: string, second_name: string }> }} props
 */
function LecturerPicker({ id, label, value, onChange, options }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder="Choose a lecturer" />
        </SelectTrigger>
        <SelectContent>
          {options.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.first_name} {l.second_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
