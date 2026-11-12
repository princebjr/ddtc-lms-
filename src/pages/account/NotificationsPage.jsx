import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { LoadingRegion, NotificationsSkeleton } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { formatDueShort } from '@/lib/assignments/due.js';
import {
  announceNoticesChanged,
  clearNotices,
  fetchEmailEnabled,
  fetchNotifications,
  markAllRead,
  markRead,
  PAGE_SIZE,
  restoreNotices,
  setEmailEnabled,
} from '@/lib/notifications/notifications.js';
import { cn } from '@/lib/utils.js';

// The notification centre (Phase 11, D21, ADR-019), for every role: the newest first, unread marked with
// a dot, View opens the item (and marks it read), Mark all read, Show more; and the one email switch,
// "Email me about my courses" (account emails such as password resets always go; the app always shows
// notifications).

/** @typedef {import('@/lib/notifications/notifications.js').Notice} Notice */

export default function NotificationsPage() {
  const { profile } = useAuth();
  const me = /** @type {string} */ (profile?.id);
  const toast = useToast();
  const navigate = useNavigate();
  const page = useLoad(async () => {
    const [items, email] = await Promise.all([fetchNotifications(), fetchEmailEnabled(me)]);
    return { items, email, more: items.length === PAGE_SIZE };
  }, [me]);
  const [busy, setBusy] = useState(false);
  const [emailState, setEmailState] = useState(/** @type {'idle' | 'saving' | 'saved'} */ ('idle'));

  const items = page.data?.items ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  // Learners and lecturers clear notifications (owner request 2026-11-12, ADR-024); administrators keep
  // their system alerts until they act on them.
  const canClear = profile?.role === 'LEARNER' || profile?.role === 'LECTURER';

  /** Puts cleared notifications back in the list, newest first (Undo). @param {Notice[]} back */
  const putBack = (back) =>
    page.setData((d) => ({ ...d, items: [...d.items, ...back.filter((b) => !d.items.some((x) => x.id === b.id))].sort((a, b) => b.created_at.localeCompare(a.created_at)) }));
  /** @param {Notice[]} gone @param {string[]} ids @param {'notification.cleared' | 'notification.cleared-all'} key */
  const offerUndo = (gone, ids, key) =>
    toast.show(key, {
      onAction: () =>
        void restoreNotices(ids)
          .then(() => {
            putBack(gone);
            announceNoticesChanged();
          })
          .catch(() => toast.show('request.failed')),
    });
  const clearOne = async (/** @type {Notice} */ n) => {
    page.setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== n.id) }));
    try {
      const ids = await clearNotices([n.id]);
      announceNoticesChanged();
      offerUndo([{ ...n, read_at: n.read_at ?? new Date().toISOString() }], ids, 'notification.cleared');
    } catch {
      putBack([n]);
      toast.show('request.failed', { onAction: () => void clearOne(n) });
    }
  };
  const clearAll = async () => {
    const shown = items;
    setBusy(true);
    try {
      const ids = await clearNotices(null);
      page.setData((d) => ({ ...d, items: [], more: false }));
      announceNoticesChanged();
      const now = new Date().toISOString();
      offerUndo(shown.filter((n) => ids.includes(n.id)).map((n) => ({ ...n, read_at: n.read_at ?? now })), ids, 'notification.cleared-all');
    } catch {
      toast.show('request.failed', { onAction: () => void clearAll() });
    } finally {
      setBusy(false);
    }
  };

  const open = async (/** @type {Notice} */ n) => {
    if (!n.read_at) {
      await markRead(n.id).catch(() => undefined);
      announceNoticesChanged();
    }
    if (n.link_path) navigate(n.link_path);
    else page.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) }));
  };
  const allRead = async () => {
    setBusy(true);
    try {
      await markAllRead();
      const now = new Date().toISOString();
      page.setData((d) => ({ ...d, items: d.items.map((x) => ({ ...x, read_at: x.read_at ?? now })) }));
      announceNoticesChanged();
    } catch {
      toast.show('request.failed', { onAction: () => void allRead() });
    } finally {
      setBusy(false);
    }
  };
  const more = async () => {
    setBusy(true);
    try {
      const next = await fetchNotifications(items[items.length - 1]?.created_at ?? null);
      page.setData((d) => ({ ...d, items: [...d.items, ...next], more: next.length === PAGE_SIZE }));
    } catch {
      toast.show('request.failed', { onAction: () => void more() });
    } finally {
      setBusy(false);
    }
  };
  const setEmail = async (/** @type {boolean} */ on) => {
    page.setData((d) => ({ ...d, email: on }));
    setEmailState('saving');
    try {
      await setEmailEnabled(me, on);
      setEmailState('saved');
    } catch {
      page.setData((d) => ({ ...d, email: !on }));
      setEmailState('idle');
      toast.show('request.failed', { onAction: () => void setEmail(on) });
    }
  };

  // The same buttons in the header on desktop and above the list on phones and tablets (the header shows
  // actions only from lg; these are not floating buttons).
  const actions =
    unread || (canClear && items.length) ? (
      <>
        {unread ? (
          <Button variant="outline" onClick={() => void allRead()} loading={busy} loadingLabel="Marking as read">
            <CheckCheck aria-hidden="true" />
            Mark all read
          </Button>
        ) : null}
        {canClear && items.length ? (
          <Button variant="outline" onClick={() => void clearAll()} disabled={busy}>
            <Trash2 aria-hidden="true" />
            Clear all
          </Button>
        ) : null}
      </>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Grades, new work, reminders and changes to your courses."
        actions={actions}
      />
      {actions ? <div className="flex flex-wrap gap-2 lg:hidden" data-slot="notice-actions">{actions}</div> : null}
      <LoadingRegion loading={page.state === 'loading'} skeleton={<NotificationsSkeleton />} label="Loading notifications">
        {page.state === 'error' ? (
          <ErrorState onRetry={page.reload} />
        ) : (
          <>
            <Card className="flex flex-row items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle>
                  <Label htmlFor="email-switch">Email me about my courses</Label>
                </CardTitle>
                <CardDescription id="email-switch-help">
                  New work, reminders, grades and enrolments. Emails about your account, such as password resets, are always sent.
                </CardDescription>
                <p role="status" aria-live="polite" className="m-0 min-h-5 text-caption text-ink-secondary" data-testid="email-switch-state">
                  {emailState === 'saving' ? 'Saving…' : emailState === 'saved' ? 'Saved' : ''}
                </p>
              </div>
              <Switch
                id="email-switch"
                aria-describedby="email-switch-help"
                checked={page.data?.email ?? true}
                disabled={emailState === 'saving'}
                onCheckedChange={(on) => void setEmail(on)}
              />
            </Card>
            {items.length === 0 ? (
              <EmptyState icon={Bell} title="No notifications yet" description="When something happens in your courses, it appears here." />
            ) : (
              <ul className="m-0 list-none divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-card p-0" aria-label="Notifications">
                {items.map((n) => (
                  <li key={n.id} data-testid="notice" data-unread={n.read_at ? undefined : 'true'} className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => void open(n)}
                      className="flex min-h-16 min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left hover:bg-fill focus-visible:focus-ring"
                    >
                      <span aria-hidden="true" className={cn('mt-2 size-2.5 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className={cn('text-body text-ink', !n.read_at && 'font-semibold')}>
                            {n.title}
                            {n.read_at ? null : <span className="sr-only"> (unread)</span>}
                          </span>
                          <span className="text-body-sm text-ink-secondary">{formatDueShort(n.created_at)}</span>
                        </span>
                        <span className="break-words text-body-sm text-ink-secondary">{n.message}</span>
                      </span>
                    </button>
                    {canClear ? (
                      <Button variant="ghost" size="icon" className="m-1 self-center text-ink-secondary" onClick={() => void clearOne(n)} aria-label={`Clear notification: ${n.title}`}>
                        <X aria-hidden="true" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {page.data?.more ? (
              <Button variant="outline" className="self-center" onClick={() => void more()} disabled={busy}>
                Show more
              </Button>
            ) : null}
          </>
        )}
      </LoadingRegion>
    </div>
  );
}
