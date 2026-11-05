// Phase 4 Edge Function tests (admin): a non-administrator cannot change any role at the function
// level; an administrator needs AAL2; every administrator action produces an audit record;
// suspension revokes sessions; reset-admin-mfa is rate-limited and audited.
import { beforeAll, describe, expect, it } from 'vitest';
import { createAccount } from '../e2e/support/accounts.js';
import { call, serviceGet, signedInAdmin, signedInAs, signIn } from './support.js';

/** @type {Awaited<ReturnType<typeof signedInAdmin>>} */
let admin;
beforeAll(async () => {
  admin = await signedInAdmin();
});

/** @param {string} action @param {string} entityId */
async function audited(action, entityId) {
  const rows = await serviceGet(`audit_logs?select=actor_id&action=eq.${action}&entity_id=eq.${entityId}`);
  return rows.some((/** @type {{ actor_id: string }} */ r) => r.actor_id === admin.userId);
}

describe('set-user-role', () => {
  it('refuses a call without a sign-in', async () => {
    const target = await createAccount();
    const res = await call('set-user-role', null, { userId: target.id, role: 'ADMIN' });
    expect(res.status).toBe(401);
  });

  it('refuses a learner and a lecturer (no path lets a non-administrator change a role)', async () => {
    const target = await createAccount();
    for (const role of /** @type {const} */ (['LEARNER', 'LECTURER'])) {
      const caller = await signedInAs({ role });
      const res = await call('set-user-role', caller.token, { userId: caller.userId, role: 'ADMIN' });
      expect(res.status, role).toBe(403);
      const other = await call('set-user-role', caller.token, { userId: target.id, role: 'LECTURER' });
      expect(other.status, role).toBe(403);
    }
    expect((await serviceGet(`profiles?select=role&id=eq.${target.id}`))[0].role).toBe('LEARNER');
  });

  it('refuses an administrator without two-step verification (AAL1)', async () => {
    const aal1 = await signedInAs({ role: 'ADMIN' });
    const target = await createAccount();
    const res = await call('set-user-role', aal1.token, { userId: target.id, role: 'LECTURER' });
    expect(res.status).toBe(403);
  });

  it('lets an administrator promote and grant course creation, audited with the administrator', async () => {
    const target = await createAccount();
    const res = await call('set-user-role', admin.token, { userId: target.id, role: 'LECTURER', canCreateCourses: true });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'LECTURER', can_create_courses: true });
    expect(await audited('profile.role_changed', target.id)).toBe(true);
    expect(await audited('profile.course_creation_changed', target.id)).toBe(true);
  });

  it('refuses an administrator changing their own role', async () => {
    const res = await call('set-user-role', admin.token, { userId: admin.userId, role: 'LEARNER' });
    expect(res.status).toBe(403);
  });

  it('suspension revokes the user\'s sessions and blocks their data at once', async () => {
    const learner = await signedInAs();
    const before = await learner.client.from('profiles').select('id').eq('id', learner.userId);
    expect(before.data).toHaveLength(1);
    const res = await call('set-user-role', admin.token, { userId: learner.userId, status: 'SUSPENDED' });
    expect(res.status).toBe(200);
    expect(await audited('profile.status_changed', learner.userId)).toBe(true);
    expect(await audited('admin.sessions_revoked', learner.userId)).toBe(true);
    // The refresh token no longer works, and the still-valid access token reads no data.
    const refreshed = await learner.client.auth.refreshSession();
    expect(refreshed.error).not.toBeNull();
    const prefs = await learner.client.from('notification_preferences').select('user_id');
    expect(prefs.data ?? []).toHaveLength(0);
  });

  it('rejects malformed input', async () => {
    const res = await call('set-user-role', admin.token, { userId: 'not-a-uuid', role: 'ADMIN' });
    expect(res.status).toBe(400);
  });
});

describe('provision-lecturer', () => {
  it('a learner cannot provision a lecturer', async () => {
    const learner = await signedInAs();
    const res = await call('provision-lecturer', learner.token, { firstName: 'New', secondName: 'Lecturer', email: 'x-new-lecturer@ddtc.test' });
    expect(res.status).toBe(403);
  });

  it('an administrator invites a new lecturer, audited', async () => {
    const email = `lecturer-${Date.now()}@ddtc.test`;
    const res = await call('provision-lecturer', admin.token, { firstName: 'Grace', secondName: 'Owusu', email, canCreateCourses: true });
    expect(res.status).toBe(200);
    expect(res.body.invited).toBe(true);
    const [profile] = await serviceGet(`profiles?select=role,can_create_courses,first_name&id=eq.${res.body.userId}`);
    expect(profile).toMatchObject({ role: 'LECTURER', can_create_courses: true, first_name: 'Grace' });
    expect(await audited('admin.lecturer_invited', res.body.userId)).toBe(true);
  });

  it('an administrator promotes an existing learner to lecturer', async () => {
    const learner = await createAccount();
    const res = await call('provision-lecturer', admin.token, { firstName: 'Test', secondName: 'Person', email: learner.email });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: learner.id, invited: false });
  });
});

describe('bulk-import-learners', () => {
  const stamp = Date.now();
  const rows = [
    { firstName: 'Abena', secondName: 'Darko', email: `import-a-${stamp}@ddtc.test` },
    { firstName: '', secondName: 'Mensah', email: `import-b-${stamp}@ddtc.test` },
    { firstName: 'Kojo', secondName: 'Asare', email: 'not-an-email' },
    { firstName: 'Abena', secondName: 'Darko', email: `import-a-${stamp}@ddtc.test` },
    { firstName: 'Ama', secondName: 'Asante', email: 'learner1@ddtc.test' },
  ];

  it('a learner cannot import', async () => {
    const learner = await signedInAs();
    expect((await call('bulk-import-learners', learner.token, { rows })).status).toBe(403);
  });

  it('preview reports each row without creating anyone', async () => {
    const res = await call('bulk-import-learners', admin.token, { rows, commit: false });
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ total: 5, ready: 1, created: 0, errors: 4 });
    expect(res.body.results.map((/** @type {{ status: string }} */ r) => r.status)).toEqual(['ready', 'error', 'error', 'error', 'error']);
    expect(res.body.results[1].row).toBe(3);
    expect(await serviceGet(`profiles?select=id&email=eq.import-a-${stamp}@ddtc.test`)).toHaveLength(0);
  });

  it('commit creates the valid learners and returns the error report, audited', async () => {
    const res = await call('bulk-import-learners', admin.token, { rows, commit: true });
    expect(res.body.summary).toMatchObject({ created: 1, errors: 4 });
    const [created] = await serviceGet(`profiles?select=role&email=eq.import-a-${stamp}@ddtc.test`);
    expect(created.role).toBe('LEARNER');
    const audits = await serviceGet(`audit_logs?select=actor_id,metadata&action=eq.admin.learners_imported&actor_id=eq.${admin.userId}`);
    expect(audits.length).toBeGreaterThan(0);
  });
});

describe('reset-admin-mfa', () => {
  it('a learner cannot reset MFA', async () => {
    const learner = await signedInAs();
    const other = await createAccount({ role: 'ADMIN' });
    expect((await call('reset-admin-mfa', learner.token, { userId: other.id })).status).toBe(403);
  });

  it('removes the other administrator\'s factors, audited, and is limited to 3 an hour', async () => {
    const other = await signedInAdmin();
    const first = await call('reset-admin-mfa', admin.token, { userId: other.userId });
    expect(first.status).toBe(200);
    expect(first.body.removedFactors).toBe(1);
    expect(await audited('admin.mfa_reset', other.userId)).toBe(true);
    // The reset administrator's sessions are revoked: they sign in again and enrol a new factor.
    const again = await signIn(other.email, 'E2e-Password-2026');
    const { data: factors } = await again.client.auth.mfa.listFactors();
    expect(factors?.totp ?? []).toHaveLength(0);

    await call('reset-admin-mfa', admin.token, { userId: other.userId });
    await call('reset-admin-mfa', admin.token, { userId: other.userId });
    const fourth = await call('reset-admin-mfa', admin.token, { userId: other.userId });
    expect(fourth.status).toBe(429);
  });

  it('an administrator cannot reset their own MFA', async () => {
    const res = await call('reset-admin-mfa', admin.token, { userId: admin.userId });
    expect(res.status).toBe(403);
  });
});
