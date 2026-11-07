import { useEffect, useState } from 'react';
import { FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.jsx';
import { Sheet, SheetContent } from '@/components/ui/sheet.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { Switch } from '@/components/ui/switch.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { useAvatarUrl } from '@/hooks/use-avatar-url.js';
import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from '@/lib/admin/users.js';
import { formatIdNumber } from '@/lib/id-number.js';
import { changeLecturer, fetchActiveLecturers, fetchOwnedActiveCourses } from '@/lib/courses/courses.js';
import { callFunction } from '@/lib/functions.js';

// The user panel (prototype `det`): role, course creation, suspend or reactivate (Undo, UI_FEEDBACK),
// deactivate and role changes (confirmation dialog), and administrator MFA reset. Every action is an
// Edge Function call; the server re-checks and audits. An administrator cannot act on themself.
// Phase 5: lecturers get Publish without approval (ADR-005); a lecturer who still owns courses that
// are not archived hands each one to another lecturer before being deactivated or given another role.

/** @typedef {import('@/lib/admin/users.js').AdminUser} AdminUser */

/**
 * @param {{ user: AdminUser, isSelf: boolean, onClose: () => void, onChanged: (u: Partial<AdminUser> & { id: string }) => void }} props
 */
export function UserSheet({ user, isSelf, onClose, onChanged }) {
  const toast = useToast();
  const imageUrl = useAvatarUrl(user.profile_image_file_id);
  const [busy, setBusy] = useState(/** @type {string | null} */ (null));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [confirm, setConfirm] = useState(/** @type {null | { title: string, body: string, action: string, destructive?: boolean, run: () => Promise<void> }} */ (null));
  const name = `${user.first_name} ${user.second_name}`;
  const [handover, setHandover] = useState(/** @type {null | { courses: Awaited<ReturnType<typeof fetchOwnedActiveCourses>>, then: () => Promise<void> }} */ (null));

  /**
   * A lecturer leaving teaching must hand over the courses they own first (Phase 5); otherwise the
   * change runs at once.
   * @param {() => Promise<void>} then
   */
  const leaveTeaching = async (then) => {
    if (user.role !== 'LECTURER') return then();
    try {
      const courses = await fetchOwnedActiveCourses(user.id);
      if (courses.length) return setHandover({ courses, then });
    } catch {
      return setMessage("The lecturer's courses could not be checked. Try again.");
    }
    return then();
  };

  /** @param {string} key @param {Record<string, unknown>} body @returns {Promise<boolean>} */
  const change = async (key, body) => {
    setBusy(key);
    setMessage(null);
    try {
      const res = /** @type {{ user: Partial<AdminUser> }} */ (await callFunction('set-user-role', { userId: user.id, ...body }));
      onChanged({ id: user.id, ...res.user });
      return true;
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const suspend = async () => {
    if (await change('status', { status: 'SUSPENDED' })) {
      toast.show('admin.account-suspended', { onAction: () => change('status', { status: 'ACTIVE' }) });
    }
  };
  const reactivate = async () => {
    const previous = user.account_status;
    if (await change('status', { status: 'ACTIVE' })) {
      toast.show('admin.account-reactivated', { onAction: () => change('status', { status: previous }) });
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent title={name} description={user.email}>
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <UserAvatar firstName={user.first_name} secondName={user.second_name} imageUrl={imageUrl} size={56} />
              <div className="flex flex-col gap-1">
                <p className="m-0 text-body text-ink">{ROLE_LABEL[user.role]}</p>
                <p className="m-0 text-body-sm text-ink-secondary">
                  ID number <span className="tabular-nums text-ink">{formatIdNumber(user.id_number)}</span>
                </p>
                <StatusChip tone={STATUS_TONE[user.account_status]}>{STATUS_LABEL[user.account_status]}</StatusChip>
              </div>
            </div>

            {isSelf ? (
              <p className="m-0 rounded-md bg-fill p-4 text-body-sm text-ink-secondary">This is your account. Another administrator must change your role or status.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="user-role">Role</Label>
                  <Select
                    value={user.role}
                    onValueChange={(role) =>
                      setConfirm({
                        title: `Make ${name} ${ROLE_LABEL[/** @type {AdminUser['role']} */ (role)].toLowerCase()}?`,
                        body:
                          role === 'LEARNER'
                            ? 'They lose staff access at once. Their courses and records are kept.'
                            : 'They get staff access. Staff sign in with email and password only, so any Google sign-in on this account is removed.',
                        action: 'Change role',
                        run: async () => {
                          const apply = async () => {
                            if (await change('role', { role })) toast.show('admin.permissions-updated');
                          };
                          await (role === 'LECTURER' ? apply() : leaveTeaching(apply));
                        },
                      })
                    }
                  >
                    <SelectTrigger id="user-role" aria-label="Role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {user.role === 'LECTURER' ? (
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="user-can-create">Can create courses</Label>
                    <Switch
                      id="user-can-create"
                      checked={user.can_create_courses}
                      disabled={busy !== null || user.account_status !== 'ACTIVE'}
                      onCheckedChange={async (v) => {
                        if (await change('create', { canCreateCourses: v })) toast.show('admin.permissions-updated');
                      }}
                    />
                  </div>
                ) : null}

                {user.role === 'LECTURER' ? (
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="user-direct-publish" className="flex flex-col gap-1">
                      <span>Publish without approval</span>
                      <span className="text-body-sm text-ink-secondary">Their courses go live without waiting in the approval queue.</span>
                    </Label>
                    <Switch
                      id="user-direct-publish"
                      checked={Boolean(user.can_publish_directly)}
                      disabled={busy !== null || user.account_status !== 'ACTIVE'}
                      onCheckedChange={async (v) => {
                        if (await change('direct', { canPublishDirectly: v })) toast.show('admin.permissions-updated');
                      }}
                    />
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {user.account_status === 'ACTIVE' ? (
                    <Button variant="outline" onClick={suspend} loading={busy === 'status'} loadingLabel="Suspending">
                      Suspend account
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={reactivate} loading={busy === 'status'} loadingLabel="Reactivating">
                      Reactivate account
                    </Button>
                  )}
                  {user.account_status !== 'DEACTIVATED' ? (
                    <Button
                      variant="destructive"
                      onClick={() =>
                        setConfirm({
                          title: `Deactivate ${name}?`,
                          body: 'They are signed out everywhere and cannot sign in. Their records are kept, and an administrator can reactivate the account later.',
                          action: 'Deactivate',
                          destructive: true,
                          run: () =>
                            leaveTeaching(async () => {
                              if (await change('status', { status: 'DEACTIVATED' })) toast.show('admin.permissions-updated');
                            }),
                        })
                      }
                    >
                      Deactivate
                    </Button>
                  ) : null}
                  {user.role === 'ADMIN' ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setConfirm({
                          title: `Reset two-step verification for ${name}?`,
                          body: 'Use this when they have lost their authenticator. They are signed out and set up a new authenticator at their next sign-in. This is recorded.',
                          action: 'Reset',
                          destructive: true,
                          run: async () => {
                            setBusy('mfa');
                            try {
                              await callFunction('reset-admin-mfa', { userId: user.id });
                              toast.show('admin.mfa-reset', { params: { name } });
                            } catch (error) {
                              setMessage(/** @type {Error} */ (error).message);
                            } finally {
                              setBusy(null);
                            }
                          },
                        })
                      }
                    >
                      Reset two-step verification
                    </Button>
                  ) : null}
                </div>
                <FormMessage>{message}</FormMessage>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {handover ? (
        <HandoverDialog
          lecturerId={user.id}
          name={name}
          courses={handover.courses}
          onClose={() => setHandover(null)}
          onDone={async () => {
            const then = handover.then;
            setHandover(null);
            await then();
          }}
        />
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        {confirm ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirm.title}</DialogTitle>
              <DialogDescription>{confirm.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={confirm.destructive ? 'destructive' : 'primary'}
                onClick={async () => {
                  const run = confirm.run;
                  setConfirm(null);
                  await run();
                }}
              >
                {confirm.action}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

/**
 * Hand over every course the lecturer owns (not archived) before they leave teaching. Each course
 * gets a new owner (transfer: the leaving lecturer becomes a co-lecturer, whose place closes when the
 * change goes through). Nothing is deleted.
 * @param {{ lecturerId: string, name: string, courses: Array<{ id: string, title: string, course_code: string }>, onClose: () => void, onDone: () => Promise<void> }} props
 */
function HandoverDialog({ lecturerId, name, courses, onClose, onDone }) {
  const toast = useToast();
  const [lecturers, setLecturers] = useState(/** @type {Awaited<ReturnType<typeof fetchActiveLecturers>> | null} */ (null));
  const [owners, setOwners] = useState(/** @type {Record<string, string>} */ ({}));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    fetchActiveLecturers()
      .then((list) => setLecturers(list.filter((l) => l.id !== lecturerId)))
      .catch(() => setMessage('The lecturers could not be loaded. Close and try again.'));
  }, [lecturerId]);

  const ready = courses.every((c) => owners[c.id]);
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      for (const c of courses) await changeLecturer(c.id, { lecturerId: owners[c.id] }, 'transfer');
      toast.show('admin.owner-changed');
      await onDone();
    } catch (error) {
      setMessage(/** @type {Error} */ (error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand over {name}&apos;s courses first</DialogTitle>
          <DialogDescription>Choose a new owner for each course. All course records are kept.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {courses.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <Label htmlFor={`owner-${c.id}`}>
                {c.title} ({c.course_code})
              </Label>
              <Select value={owners[c.id]} onValueChange={(v) => setOwners((o) => ({ ...o, [c.id]: v }))} disabled={!lecturers}>
                <SelectTrigger id={`owner-${c.id}`} aria-label={`New owner for ${c.title}`}>
                  <SelectValue placeholder="Choose a lecturer" />
                </SelectTrigger>
                <SelectContent>
                  {(lecturers ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.first_name} {l.second_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <FormMessage>{message}</FormMessage>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready} loading={busy} loadingLabel="Handing over">
            Hand over and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
