import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { fetchCourses, transitionCourse } from '@/lib/courses/courses.js';
import { ApproveDialog, ReturnDialog } from '../courses/CourseWorkspacePage.jsx';

// Course approval (D04, prototype `apr`): Pending, Returned and Approved. Approve publishes the
// course and can let the lecturer publish without approval from now on (ADR-005); Return sends it
// back to draft with a reason. Both are audited by course-lifecycle.

/** @typedef {import('@/lib/courses/courses.js').CourseSummary} CourseSummary */

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });

/** @type {Record<'pending' | 'returned' | 'approved', { label: string, query: Parameters<typeof fetchCourses>[0] }>} */
const VIEWS = {
  pending: { label: 'Pending', query: { status: 'PENDING_APPROVAL', withOwner: true } },
  returned: { label: 'Returned', query: { status: 'DRAFT', returned: true, withOwner: true } },
  approved: { label: 'Approved', query: { status: 'PUBLISHED', withOwner: true, limit: 50 } },
};

export default function ApprovalsPage() {
  const toast = useToast();
  const [view, setView] = useState(/** @type {keyof typeof VIEWS} */ ('pending'));
  const list = useLoad(() => fetchCourses(VIEWS[view].query), [view]);
  const [dialog, setDialog] = useState(/** @type {null | { kind: 'approve' | 'return', course: CourseSummary }} */ (null));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  /** @param {CourseSummary} course @param {'approve' | 'return'} action @param {{ reason?: string, grantDirect?: boolean }} options */
  const decide = async (course, action, options) => {
    setBusy(true);
    setMessage(null);
    try {
      await transitionCourse(course.id, action, options);
      toast.show(action === 'approve' ? 'admin.course-approved' : 'admin.course-returned');
      list.setData((rows) => rows.filter((r) => r.id !== course.id));
      setDialog(null);
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Course approval" description="Review courses before learners can see them" />
      <Tabs value={view} onValueChange={(v) => setView(/** @type {keyof typeof VIEWS} */ (v))}>
        <TabsList aria-label="Approval lists">
          {Object.entries(VIEWS).map(([key, v]) => (
            <TabsTrigger key={key} value={key}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FormMessage>{message}</FormMessage>
      {list.state === 'error' ? (
        <ErrorState title="The list could not be loaded" onRetry={list.reload} />
      ) : (
        <LoadingRegion loading={list.state === 'loading'} skeleton={<ListSkeleton rows={4} columns={3} />} onRetry={list.reload}>
          {rows.length ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {rows.map((c) => (
                <li key={c.id}>
                  <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Link to={`/admin/courses/${c.id}`} className="text-headline text-ink hover:underline focus-visible:focus-ring">
                        {c.title}
                      </Link>
                      <span className="text-body-sm text-ink-secondary">
                        {c.course_code} · {c.owner || 'No owner'}
                        {view === 'pending' && c.submitted_at ? ` · sent ${dateFormat.format(new Date(c.submitted_at))}` : ''}
                      </span>
                      {view === 'returned' && c.return_reason ? <span className="text-body-sm text-ink">Reason: {c.return_reason}</span> : null}
                    </div>
                    {view === 'pending' ? (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setDialog({ kind: 'return', course: c })}>
                          Return
                        </Button>
                        <Button onClick={() => setDialog({ kind: 'approve', course: c })}>Approve</Button>
                      </div>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title={view === 'pending' ? 'Nothing is waiting for approval' : view === 'returned' ? 'No returned courses' : 'No approved courses yet'}
            />
          )}
        </LoadingRegion>
      )}

      <ApproveDialog
        open={dialog?.kind === 'approve'}
        lecturer="the lecturer who sent it"
        busy={busy}
        onClose={() => setDialog(null)}
        onApprove={(grantDirect) => dialog && decide(dialog.course, 'approve', { grantDirect })}
      />
      <ReturnDialog open={dialog?.kind === 'return'} busy={busy} onClose={() => setDialog(null)} onReturn={(reason) => dialog && decide(dialog.course, 'return', { reason })} />
    </div>
  );
}
