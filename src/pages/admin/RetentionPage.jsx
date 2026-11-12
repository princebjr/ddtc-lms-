import { useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { ListSkeleton, LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { EmptyState, ErrorState } from '@/components/feedback/States.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardDescription, CardTitle } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { NativeSelect } from '@/components/ui/native-select.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { useLoad } from '@/hooks/use-load.js';
import { saveSetting } from '@/lib/admin/insight.js';
import { fetchHoldCourses, fetchHolds, fetchRetention, holdError, liveFrom, placeHold, releaseHold, searchHoldLearners } from '@/lib/admin/retention.js';
import { formatDue } from '@/lib/assignments/due.js';
import { formatIdNumber } from '@/lib/id-number.js';

// Retention (Phase 12, D20, ADR-022): what retention does, the switch for live deletion, holds and runs, for
// administrators with two-step verification (the database refuses everyone else).
// - Only learners' recorded or uploaded audio on submitted assignment and examination answers is ever
//   removed, retention_days (180) after the grade or result is released. Text, PDF, Word, lesson and
//   instruction audio, grades and history are kept. The period changes only through the runbook (decision 3).
// - The switch asks for confirmation before switching on. Live deletion starts only after
//   retention_dry_run_days (30) of dry runs, whatever the switch says (decision 2; the database decides).
// - Holds on a course or a learner are placed here; one answer is held from its answer or script page.

/** @typedef {import('@/lib/admin/retention.js').Hold} Hold */

const SCOPE_LABEL = /** @type {const} */ ({ COURSE: 'Course', LEARNER: 'Learner', SUBMISSION: 'Assignment answer', EXAM_ATTEMPT: 'Examination answer' });

export default function RetentionPage() {
  const page = useLoad(fetchRetention, []);
  const holds = useLoad(fetchHolds, []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Retention" description="When learners' recorded answers are removed, and what is kept." />
      <LoadingRegion loading={page.state === 'loading'} skeleton={<ListSkeleton rows={3} />} label="Loading retention">
        {page.state === 'error' || !page.data ? (
          <ErrorState onRetry={page.reload} />
        ) : (
          <>
            <StatusCard status={page.data.status} onChanged={page.reload} />
            <HoldsCard holds={holds} />
            <RunsCard runs={page.data.runs} />
          </>
        )}
      </LoadingRegion>
    </div>
  );
}

/** @param {{ status: import('@/lib/admin/retention.js').RetentionStatus, onChanged: () => void }} props */
function StatusCard({ status, onChanged }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const from = liveFrom(status);
  // The time this page opened, read once (not on every render).
  const [openedAt] = useState(() => Date.now());
  const waiting = !from || from.getTime() > openedAt;

  /** @param {boolean} on */
  const set = async (on) => {
    setBusy(true);
    setMessage(null);
    try {
      await saveSetting('retention_enabled', on);
      toast.show(on ? 'admin.retention-enabled' : 'admin.retention-disabled');
      setConfirming(false);
      onChanged();
    } catch (e) {
      setMessage(holdError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6" aria-labelledby="retention-status" data-slot="retention-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle id="retention-status">Learner audio</CardTitle>
        <StatusChip tone={status.enabled ? 'warning' : 'neutral'}>{status.enabled ? (waiting ? 'On, dry runs first' : 'Live deletion on') : 'Off'}</StatusChip>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-body text-ink">
        <li>{`Learners' recorded or uploaded audio on assignment and examination answers is removed ${status.days} days after the grade or result is released.`}</li>
        <li>Answers' text, PDF and Word files, lesson and instruction audio, grades, feedback and history are always kept.</li>
        <li>Held courses, learners and answers are never touched.</li>
      </ul>
      <CardDescription>
        {status.firstDryRun
          ? `Daily dry runs began ${formatDue(status.firstDryRun)} (Ghana time). Live deletion can start from ${formatDue(/** @type {Date} */ (from).toISOString())}, and only while switched on.`
          : `No run yet. The first ${status.dryRunDays} days are dry runs only: they count what would be removed and change nothing.`}{' '}
        {`The ${status.days}-day period changes only with DDTC's approval (see the runbook).`}
      </CardDescription>
      <div className="flex min-h-11 items-center gap-3">
        <Switch
          id="retention-live"
          checked={status.enabled}
          disabled={busy}
          onCheckedChange={(on) => (on ? setConfirming(true) : void set(false))}
          aria-describedby="retention-live-hint"
        />
        <div className="flex flex-col">
          <Label htmlFor="retention-live">Live deletion</Label>
          <span id="retention-live-hint" className="text-body-sm text-ink-secondary">
            Off at launch. Switch on only after the Phase 14 review.
          </span>
        </div>
      </div>
      <FormMessage>{message}</FormMessage>
      <AlertDialog open={confirming} onOpenChange={(o) => !busy && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch on live deletion?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Learners' audio answers released more than ${status.days} days ago will be deleted permanently from storage, except where held. ${
                waiting ? `Nothing is deleted until ${status.dryRunDays} days of dry runs have passed.` : 'The next daily run deletes them.'
              } Text, documents and grades are kept.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost" disabled={busy}>
                Cancel
              </Button>
            </AlertDialogCancel>
            <Button variant="destructive" onClick={() => void set(true)} loading={busy} loadingLabel="Switching on">
              Switch on
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** @param {{ holds: ReturnType<typeof useLoad<Hold[]>> }} props */
function HoldsCard({ holds }) {
  const toast = useToast();
  const courses = useLoad(fetchHoldCourses, []);
  const [scope, setScope] = useState(/** @type {'COURSE' | 'LEARNER'} */ ('COURSE'));
  const [courseId, setCourseId] = useState('');
  const [search, setSearch] = useState('');
  const [learners, setLearners] = useState(/** @type {Awaited<ReturnType<typeof searchHoldLearners>> | null} */ (null));
  const [learnerId, setLearnerId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const all = holds.data ?? [];
  const active = all.filter((h) => !h.released_at);
  const released = all.filter((h) => h.released_at);

  const find = async () => {
    setMessage(null);
    try {
      setLearners(await searchHoldLearners(search));
      setLearnerId('');
    } catch (e) {
      setMessage(holdError(e));
    }
  };
  /** @param {'COURSE' | 'LEARNER' | 'SUBMISSION' | 'EXAM_ATTEMPT'} s @param {string} id @param {string} why */
  const placeAndOffer = async (s, id, why) => {
    const holdId = await placeHold(s, id, why);
    holds.reload();
    toast.show('admin.hold-placed', { onAction: () => void releaseHold(holdId).then(holds.reload, () => toast.show('request.failed')) });
  };
  const place = async () => {
    const id = scope === 'COURSE' ? courseId : learnerId;
    if (!id) return setMessage(scope === 'COURSE' ? 'Choose the course' : 'Find and choose the learner');
    if (reason.trim().length < 3) return setMessage('Give a reason of 3 to 500 characters');
    setBusy('place');
    setMessage(null);
    try {
      await placeAndOffer(scope, id, reason.trim());
      setReason('');
    } catch (e) {
      setMessage(holdError(e));
    } finally {
      setBusy(null);
    }
  };
  /** @param {Hold} h */
  const release = async (h) => {
    setBusy(h.id);
    setMessage(null);
    try {
      await releaseHold(h.id);
      holds.reload();
      toast.show('admin.hold-released', { onAction: () => void placeAndOffer(h.scope, h.scope_id, h.reason).catch(() => toast.show('request.failed')) });
    } catch (e) {
      setMessage(holdError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6" aria-labelledby="retention-holds" data-slot="retention-holds">
      <div className="flex flex-col gap-1">
        <CardTitle id="retention-holds">Holds</CardTitle>
        <CardDescription>A hold keeps every recording of a course or a learner until it is released. To hold one answer, open it and use "Hold this answer's audio".</CardDescription>
      </div>
      <div className="flex flex-col gap-3 rounded-md border border-hairline p-3" data-slot="place-hold">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="hold-scope">Hold</Label>
            <NativeSelect id="hold-scope" value={scope} onChange={(e) => setScope(/** @type {'COURSE' | 'LEARNER'} */ (e.target.value))}>
              <option value="COURSE">A course</option>
              <option value="LEARNER">A learner</option>
            </NativeSelect>
          </div>
          {scope === 'COURSE' ? (
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <Label htmlFor="hold-course">Course</Label>
              <NativeSelect id="hold-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Choose a course</option>
                {(courses.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{`${c.course_code} ${c.title}`}</option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <Label htmlFor="hold-learner-search">Learner's name</Label>
              <div className="flex gap-2">
                <Input id="hold-learner-search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void find()} maxLength={100} />
                <Button variant="outline" onClick={() => void find()}>
                  Find
                </Button>
              </div>
              {learners ? (
                learners.length ? (
                  <NativeSelect aria-label="Learner" value={learnerId} onChange={(e) => setLearnerId(e.target.value)}>
                    <option value="">{`Choose one of ${learners.length}`}</option>
                    {learners.map((l) => (
                      <option key={l.id} value={l.id}>{`${l.first_name} ${l.second_name}${l.id_number ? ` (${formatIdNumber(l.id_number)})` : ''}`}</option>
                    ))}
                  </NativeSelect>
                ) : (
                  <p className="m-0 text-body-sm text-ink-secondary">No learner by that name.</p>
                )
              ) : null}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="hold-reason">Reason</Label>
          <Textarea id="hold-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
        </div>
        <FormMessage>{message}</FormMessage>
        <Button className="self-start" onClick={() => void place()} loading={busy === 'place'} loadingLabel="Placing hold">
          Place hold
        </Button>
      </div>

      <LoadingRegion loading={holds.state === 'loading'} skeleton={<ListSkeleton rows={2} />} label="Loading holds">
        {holds.state === 'error' ? (
          <ErrorState onRetry={holds.reload} />
        ) : active.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Active holds">
            {active.map((h) => (
              <li key={h.id} className="flex flex-col gap-2 rounded-md bg-fill p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="active-hold">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusChip tone="info">{SCOPE_LABEL[h.scope]}</StatusChip>
                    <span className="break-words text-body text-ink">{h.subject ?? 'Not found'}</span>
                  </span>
                  {h.detail ? <span className="text-body-sm text-ink-secondary">{h.detail}</span> : null}
                  <span className="break-words text-body-sm text-ink-secondary">{`${h.reason} · placed by ${h.placed_by_name}, ${formatDue(h.placed_at)}`}</span>
                </div>
                <Button variant="outline" className="self-start sm:self-center" onClick={() => void release(h)} loading={busy === h.id} loadingLabel="Releasing" aria-label={`Release the hold on ${h.subject ?? 'this item'}`}>
                  Release
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No holds" description="Nothing is held. Retention applies to every course and learner." />
        )}
      </LoadingRegion>
      {released.length ? (
        <details className="text-body-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-label text-link focus-visible:focus-ring">{`Released holds (${released.length})`}</summary>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {released.map((h) => (
              <li key={h.id} className="break-words text-ink-secondary">{`${SCOPE_LABEL[h.scope]}: ${h.subject ?? 'Not found'}${h.detail ? `, ${h.detail}` : ''}. ${h.reason}. Released by ${h.released_by_name}, ${formatDue(/** @type {string} */ (h.released_at))}.`}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

/** @param {{ runs: import('@/lib/admin/retention.js').Run[] }} props */
function RunsCard({ runs }) {
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6" aria-labelledby="retention-runs" data-slot="retention-runs">
      <div className="flex flex-col gap-1">
        <CardTitle id="retention-runs">Recent runs</CardTitle>
        <CardDescription>The job runs every day at 02:40 Ghana time. A failed deletion is tried again the next day.</CardDescription>
      </div>
      {runs.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0" aria-label="Recent runs">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-testid="retention-run">
              <span className="flex flex-wrap items-center gap-2">
                <StatusChip tone={r.mode === 'LIVE' ? 'warning' : 'neutral'}>{r.mode === 'LIVE' ? 'Live' : 'Dry run'}</StatusChip>
                <span className="text-body-sm tabular-nums text-ink">{`${formatDue(r.started_at)} (Ghana time)`}</span>
              </span>
              <span className="text-body-sm tabular-nums text-ink-secondary">
                {r.mode === 'LIVE'
                  ? `${r.eligible_count} found · ${r.deleted_count} removed · ${r.failed_count} failed`
                  : `${r.eligible_count} would be removed · nothing changed`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No runs yet" description="The first daily run appears here." />
      )}
    </Card>
  );
}
