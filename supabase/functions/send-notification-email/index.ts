// send-notification-email (SECURITY_AND_ACCESS.md section 8, D21, D31, ADR-019): run every minute by
// pg_cron with the service-role key. Claims due notification_deliveries (anyone who turned email off is
// suppressed by the claim), sends each through Resend and reports the result, which applies the retry
// schedule (1, 5, 15, 60, 240 minutes, then FAILED with an alert to administrators; a permanent failure
// is FAILED at once). Without RESEND_API_KEY it sends nothing and leaves the emails queued.
import { requireScheduler, serviceClient } from '../_shared/auth.ts';
import { classifyResponse, renderEmail, type SendOutcome } from '../_shared/email.ts';
import { HttpError, json, serve } from '../_shared/http.ts';

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
// Without a verified DDTC domain, staging uses Resend's test sender (owner answer 5 of 2026-11-10).
const FROM = Deno.env.get('EMAIL_FROM') ?? 'DDTC LMS <onboarding@resend.dev>';
const APP_URL = Deno.env.get('APP_URL') ?? '';

type Claimed = { delivery_id: string; email: string; first_name: string; title: string; message: string; link_path: string | null };

async function send(row: Claimed): Promise<SendOutcome> {
  const email = renderEmail({ firstName: row.first_name, title: row.title, message: row.message, linkPath: row.link_path }, APP_URL);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': row.delivery_id },
      body: JSON.stringify({ from: FROM, to: [row.email], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(15000),
    });
    return classifyResponse(res.status, await res.text());
  } catch (e) {
    return { ok: false, permanent: false, error: `Network error: ${String((e as Error)?.message ?? e).slice(0, 300)}`, stopBatch: false };
  }
}

serve(async (req) => {
  await requireScheduler(req);
  if (!RESEND_KEY) return json(req, 200, { sent: 0, failed: 0, skipped: 'Email is not configured' });

  const admin = serviceClient();
  const { data, error } = await admin.rpc('notification_deliveries_claim', { p_limit: 50 });
  if (error) throw new HttpError(500, 'server_error', 'Could not claim emails');

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as Claimed[]) {
    const outcome = await send(row);
    const { error: resultError } = await admin.rpc('notification_delivery_result', {
      p_delivery: row.delivery_id,
      p_ok: outcome.ok,
      p_provider_id: outcome.ok ? outcome.id : null,
      p_error: outcome.ok ? null : outcome.error,
      p_permanent: outcome.ok ? false : outcome.permanent,
    });
    if (resultError) console.error('send-notification-email: could not record a result');
    if (outcome.ok) sent += 1;
    else {
      failed += 1;
      if (outcome.stopBatch) break; // the key is wrong: the rest stay leased and are retried later
    }
  }
  if (failed) console.error(`send-notification-email: ${failed} email(s) not sent`);
  return json(req, 200, { sent, failed });
});
