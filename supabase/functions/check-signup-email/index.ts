// Before-user-created hook (Phase 14 follow-up, owner 2026-11-17: "the system accepts wrong emails when signing
// up"). Supabase Auth calls this before it creates any account with an email address and a password (sign-up,
// invitation). Until confirmation emails can be switched back on (they need DDTC's domain), it refuses an address
// whose domain cannot receive email: the domain does not exist, or it publishes a "null MX" (RFC 7505) saying it
// takes no mail. A typo such as gmial.com that happens to exist is caught on the Sign Up form instead.
// - Only Supabase Auth may call it: the request must carry a valid Standard Webhooks signature (AUTH_HOOK_SECRET).
// - Google and other providers are not checked (the provider has verified the address).
// - If the lookup itself fails (DNS slow or down), the sign-up is allowed: the check never locks people out.
// - TEST_EMAIL_DOMAINS lists the domains the local and CI tests use; it is never set in production.
import { Webhook } from 'npm:standardwebhooks@1.0.0';

const SECRET = (Deno.env.get('AUTH_HOOK_SECRET') ?? '').replace(/^v1,whsec_/, '');
const TEST_DOMAINS = new Set(
  (Deno.env.get('TEST_EMAIL_DOMAINS') ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
);
export const REFUSED = 'This email address cannot receive email. Check it for typing mistakes, or use another address.';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** true: the domain can receive email; false: it cannot; null: unknown (lookup failed). */
async function canReceiveMail(domain: string): Promise<boolean | null> {
  try {
    const mx = await Deno.resolveDns(domain, 'MX');
    if (mx.length === 0) return await hasAddress(domain);
    // A single MX record pointing at "." is a null MX: the domain accepts no email.
    if (mx.length === 1 && (mx[0].exchange === '.' || mx[0].exchange === '')) return false;
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return await hasAddress(domain);
    return await overHttps(domain);
  }
}

/** Without MX records, mail goes to the domain's own address (RFC 5321, implicit MX). */
async function hasAddress(domain: string): Promise<boolean | null> {
  for (const type of ['A', 'AAAA'] as const) {
    try {
      if ((await Deno.resolveDns(domain, type)).length > 0) return true;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) return null;
    }
  }
  return false;
}

/** Fallback when the runtime cannot resolve DNS itself: DNS over HTTPS (only the domain is sent, never the address). */
async function overHttps(domain: string): Promise<boolean | null> {
  try {
    const ask = async (type: string) => {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
      });
      return (await res.json()) as { Status: number; Answer?: { type: number; data: string }[] };
    };
    const mx = await ask('MX');
    if (mx.Status === 3) return false; // NXDOMAIN: the domain does not exist
    if (mx.Status !== 0) return null;
    const records = (mx.Answer ?? []).filter((a) => a.type === 15);
    if (records.length === 1 && /^0\s+\.?$/.test(records[0].data.trim())) return false;
    if (records.length > 0) return true;
    const a = await ask('A');
    return a.Status === 0 && (a.Answer ?? []).some((r) => r.type === 1) ? true : false;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const body = await req.text();
  let payload: { user?: { email?: string; app_metadata?: { provider?: string } } };
  try {
    if (!SECRET) throw new Error('no secret');
    payload = new Webhook(SECRET).verify(body, Object.fromEntries(req.headers)) as typeof payload;
  } catch {
    return reply(401, { error: { http_code: 401, message: 'Only Supabase Auth may call this.' } });
  }

  const provider = payload.user?.app_metadata?.provider ?? 'email';
  const email = String(payload.user?.email ?? '').trim().toLowerCase();
  if (provider !== 'email' || !email) return reply(200, {});
  const domain = email.split('@')[1] ?? '';
  if (TEST_DOMAINS.has(domain)) return reply(200, {});

  const verdict = await canReceiveMail(domain);
  // A refusal is a 200 with the error in the body: Supabase Auth reads a non-2xx status as a broken hook.
  if (verdict === false) return reply(200, { error: { http_code: 400, message: REFUSED } });
  return reply(200, {});
});
