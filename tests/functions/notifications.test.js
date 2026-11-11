// Phase 11 (D21, D31, ADR-019): send-notification-email is a scheduled job: only the service-role key
// may run it, and without RESEND_API_KEY (as locally) it sends nothing and leaves emails queued. The
// retry schedule, suppression and leasing are tested in pgTAP 29; the email and reply classes in
// tests/unit/email.test.js.
import { describe, expect, it } from 'vitest';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { call, signedInAs } from './support.js';

describe('send-notification-email', () => {
  it('refuses anyone but the scheduled job', async () => {
    const learner = await signedInAs({});
    expect((await call('send-notification-email', learner.token, {})).status).toBe(403);
    expect((await call('send-notification-email', null, {})).status).toBe(403);
  });

  it('sends nothing until email is configured', async () => {
    const s = requireSupabase();
    const res = await call('send-notification-email', s.serviceKey, {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: 0, failed: 0 });
  });
});
