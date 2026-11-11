import { Archive, Megaphone, Send } from 'lucide-react';
import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardTitle } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDue } from '@/lib/assignments/due.js';
import { archiveAnnouncement, audienceLabel, fetchAnnouncements, sendAnnouncement } from '@/lib/announcements.js';
import { fetchBranches } from '@/lib/branches.js';
import { fetchCourses } from '@/lib/courses/courses.js';

// Announcements (Phase 11; owner request and answers of 2026-11-11, ADR-019). A lecturer writes to the
// learners of a published course they teach; an administrator to all learners, one course or one branch.
// Learners see it in their notification centre (and on the course page) and get an email unless they
// turned course emails off. A confirmation comes first, because it reaches many people at once. Sent
// announcements are listed with how many learners they reached; Archive hides one from learners (kept).

const MAX_TITLE = 120;
const MAX_BODY = 2000;

/** @param {{ role: 'admin' | 'lecturer' }} props */
export default function AnnouncementsPage({ role }) {
  const toast = useToast();
  const lists = useLoad(async () => {
    const [courses, branches] = await Promise.all([fetchCourses({ status: 'PUBLISHED' }), role === 'admin' ? fetchBranches() : Promise.resolve([])]);
    return { courses, branches: branches.filter((b) => b.is_active) };
  }, [role]);
  const sent = useLoad(() => fetchAnnouncements(), []);
  const [audience, setAudience] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const courses = lists.data?.courses ?? [];
  const branches = lists.data?.branches ?? [];
  const audienceText = (() => {
    if (audience === 'all') return 'all learners';
    const [kind, id] = audience.split(':');
    if (kind === 'course') {
      const c = courses.find((x) => x.id === id);
      return c ? `the learners of ${c.course_code} ${c.title}` : '';
    }
    const b = branches.find((x) => x.id === id);
    return b ? `the learners of the ${b.name} branch` : '';
  })();

  const check = (/** @type {import('react').FormEvent} */ e) => {
    e.preventDefault();
    if (!audience) return setMessage('Choose who the announcement is for.');
    if (!title.trim()) return setMessage('Give the announcement a title.');
    if (!body.trim()) return setMessage('Write the message.');
    setMessage(null);
    setConfirming(true);
  };
  const send = async () => {
    setBusy(true);
    try {
      const [kind, id] = audience.split(':');
      await sendAnnouncement({
        courseId: kind === 'course' ? id : null,
        branchId: kind === 'branch' ? id : null,
        everyone: audience === 'all',
        title: title.trim(),
        body: body.trim(),
      });
      toast.show('staff.announcement-sent');
      setTitle('');
      setBody('');
      setConfirming(false);
      sent.reload();
    } catch (err) {
      setConfirming(false);
      setMessage(/** @type {Error} */ (err).message || 'The announcement could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const archive = async (/** @type {string} */ id) => {
    try {
      await archiveAnnouncement(id);
      sent.setData((rows) => rows.filter((r) => r.id !== id));
    } catch {
      toast.show('request.failed', { onAction: () => void archive(id) });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Announcements"
        description={role === 'admin' ? 'Tell all learners, one course or one branch.' : 'Tell the learners of a course you teach.'}
      />
      <Card className="p-4 sm:p-6">
        <form className="flex flex-col gap-4" onSubmit={check} aria-labelledby="new-announcement">
          <CardTitle id="new-announcement">New announcement</CardTitle>
          <div className="flex flex-col gap-1">
            <Label htmlFor="a-audience">To</Label>
            <NativeSelect id="a-audience" value={audience} onChange={(e) => setAudience(e.target.value)} disabled={lists.state !== 'ready'}>
              <option value="">Choose…</option>
              {role === 'admin' ? <option value="all">All learners</option> : null}
              {courses.length ? (
                <optgroup label="A course">
                  {courses.map((c) => (
                    <option key={c.id} value={`course:${c.id}`}>
                      {`${c.course_code} ${c.title}`}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {branches.length ? (
                <optgroup label="A branch">
                  {branches.map((b) => (
                    <option key={b.id} value={`branch:${b.id}`}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </NativeSelect>
            {lists.state === 'ready' && !courses.length && role === 'lecturer' ? (
              <p className="m-0 text-body-sm text-ink-secondary">You can announce once one of your courses is published.</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="a-title">Title</Label>
            <Input id="a-title" value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="a-body">Message</Label>
            <Textarea id="a-body" rows={5} value={body} maxLength={MAX_BODY} onChange={(e) => setBody(e.target.value)} aria-describedby="a-body-count" />
            <p id="a-body-count" className="m-0 text-caption text-ink-secondary">{`${body.length} of ${MAX_BODY} characters`}</p>
          </div>
          <FormMessage>{message}</FormMessage>
          <Button type="submit" className="self-start">
            <Send aria-hidden="true" />
            Send announcement
          </Button>
        </form>
      </Card>

      <section aria-labelledby="sent-heading" className="flex flex-col gap-3">
        <h2 id="sent-heading" className="m-0 text-title-3 text-ink">
          Sent
        </h2>
        <LoadingRegion loading={sent.state === 'loading'} skeleton={<ListSkeleton rows={3} columns={3} />} label="Loading announcements">
          {sent.state === 'error' ? (
            <ErrorState onRetry={sent.reload} />
          ) : (sent.data ?? []).length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements yet" description="Announcements you send appear here." />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Sent announcements">
              {(sent.data ?? []).map((a) => (
                <li key={a.id} className="flex flex-col gap-2 rounded-md border border-hairline bg-card p-4" data-testid="sent-announcement">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-label text-ink">{a.title}</span>
                      <span className="text-caption text-ink-secondary">{`${audienceLabel(a)} · ${a.recipients} ${a.recipients === 1 ? 'learner' : 'learners'} · ${formatDue(a.created_at)}`}</span>
                    </span>
                    <Button variant="ghost" onClick={() => void archive(a.id)} aria-label={`Archive ${a.title}`}>
                      <Archive aria-hidden="true" />
                      Archive
                    </Button>
                  </div>
                  <p className="m-0 whitespace-pre-line break-words text-body text-ink">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </LoadingRegion>
      </section>

      {confirming ? (
        <AlertDialog open onOpenChange={(open) => !open && !busy && setConfirming(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send this announcement?</AlertDialogTitle>
              <AlertDialogDescription>{`It goes to ${audienceText} now, in the app and by email. It cannot be unsent, only archived.`}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost" disabled={busy}>
                  Keep editing
                </Button>
              </AlertDialogCancel>
              <Button onClick={() => void send()} loading={busy} loadingLabel="Sending">
                Send
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
