import { createHmac, randomUUID } from 'node:crypto';
import { requireSupabase } from './local-supabase.js';

// Test accounts, the Mailpit inbox and TOTP codes for the Phase 3 end-to-end suite.
// Accounts are created through Supabase's admin API (as the provisioning functions will in Phase 4)
// so every project gets its own users and tests never share state.

export const SEED_PASSWORD = 'DdtcLocal-2026';
export const SEED = {
  admin: 'admin@ddtc.test',
  lecturer: 'lecturer1@ddtc.test',
  learner: 'learner1@ddtc.test',
  suspended: 'suspended@ddtc.test',
};

/** A unique address in the reserved .test domain. @param {string} prefix */
export function uniqueEmail(prefix) {
  return `${prefix}-${randomUUID().slice(0, 12)}@ddtc.test`;
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function admin(path, init = {}) {
  const s = requireSupabase();
  const res = await fetch(`${s.url}${path}`, {
    ...init,
    headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/**
 * Creates a confirmed account and, through the trusted path, gives it a role.
 * @param {{ role?: 'ADMIN' | 'LECTURER' | 'LEARNER', status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED', password?: string, first?: string, second?: string }} [options]
 * @returns {Promise<{ id: string, email: string, password: string }>}
 */
export async function createAccount({ role = 'LEARNER', status = 'ACTIVE', password = 'E2e-Password-2026', first = 'Test', second = 'Person' } = {}) {
  const email = uniqueEmail(role.toLowerCase());
  const user = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { first_name: first, second_name: second } }),
  });
  if (role !== 'LEARNER' || status !== 'ACTIVE') {
    await admin(`/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role, account_status: status, can_create_courses: role === 'LECTURER' }),
    });
  }
  return { id: user.id, email, password };
}

/** @param {string} id */
export async function getProfile(id) {
  const rows = await admin(`/rest/v1/profiles?id=eq.${id}&select=role,account_status,first_name,second_name,can_create_courses,profile_image_file_id`);
  return rows[0];
}

/** @param {string} email */
export async function findUserByEmail(email) {
  const rows = await admin(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,role`);
  return rows[0] ?? null;
}

/**
 * Waits for the newest email to an address and returns the first link in it.
 * @param {string} to
 * @param {{ subject?: RegExp, timeoutMs?: number }} [options]
 */
export async function emailLink(to, { subject, timeoutMs = 15_000 } = {}) {
  const { mailpit } = requireSupabase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const { messages = [] } = await res.json();
    const match = messages.find((/** @type {{ Subject: string }} */ m) => !subject || subject.test(m.Subject));
    if (match) {
      const body = await (await fetch(`${mailpit}/api/v1/message/${match.ID}`)).json();
      const href = /href="([^"]+)"/.exec(body.HTML)?.[1];
      if (href) return href.replaceAll('&amp;', '&');
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email to ${to} arrived within ${timeoutMs} ms`);
}

/** @param {string} secret base32 */
function base32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/**
 * RFC 6238 TOTP code (SHA-1, 30 s, 6 digits), as an authenticator app shows it.
 * @param {string} secret base32
 * @param {number} [at] ms since epoch
 */
export function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, '0');
}
