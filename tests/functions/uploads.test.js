// Phase 4 profile images through the D18 pipeline: avatar upload rejects wrong type and oversize;
// a PENDING or REJECTED image is never shown; replacing an image removes the old object; the
// cleanup job is for the scheduler only.
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { requireSupabase } from '../e2e/support/local-supabase.js';
import { call, serviceGet, signedInAs } from './support.js';

// Smallest valid images: a 1x1 PNG and the 3-byte JPEG signature followed by filler.
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(0)]);
const NOT_AN_IMAGE = new TextEncoder().encode('this is a text file pretending to be a PNG');

/**
 * Runs register-upload, the signed upload and finalize-upload as `user`.
 * @param {{ token: string }} user @param {string} filename @param {Uint8Array} bytes
 */
async function upload(user, filename, bytes) {
  const s = requireSupabase();
  const reg = await call('register-upload', user.token, { resourceType: 'PROFILE_IMAGE', filename, size: bytes.length });
  if (reg.status !== 200) return { reg };
  const storage = createClient(s.url, s.anonKey, { global: { headers: { Authorization: `Bearer ${user.token}` } }, auth: { persistSession: false } }).storage;
  // Declared like a browser would from the name; finalize-upload checks the real bytes.
  const contentType = /\.jpe?g$/.test(filename) ? 'image/jpeg' : 'image/png';
  const put = await storage.from(reg.body.bucket).uploadToSignedUrl(reg.body.path, reg.body.token, bytes, { contentType });
  expect(put.error).toBeNull();
  const fin = await call('finalize-upload', user.token, { fileId: reg.body.fileId });
  return { reg, fin };
}

/** @param {string} id */
const fileRow = async (id) => (await serviceGet(`file_objects?select=status,storage_path,detected_mime_type&id=eq.${id}`))[0];

describe('register-upload', () => {
  it('the bucket itself refuses an upload declared as something other than an image', async () => {
    const user = await signedInAs();
    const reg = await call('register-upload', user.token, { resourceType: 'PROFILE_IMAGE', filename: 'a.png', size: PNG.length });
    const s = requireSupabase();
    const storage = createClient(s.url, s.anonKey, { global: { headers: { Authorization: `Bearer ${user.token}` } }, auth: { persistSession: false } }).storage;
    const put = await storage.from('profile-images').uploadToSignedUrl(reg.body.path, reg.body.token, PNG, { contentType: 'text/html' });
    expect(put.error).not.toBeNull();
  });

  it('refuses a call without a sign-in', async () => {
    expect((await call('register-upload', null, { resourceType: 'PROFILE_IMAGE', filename: 'a.png', size: 10 })).status).toBe(401);
  });

  it('refuses an oversize image before anything is uploaded (2 MB, D17)', async () => {
    const user = await signedInAs();
    const res = await call('register-upload', user.token, { resourceType: 'PROFILE_IMAGE', filename: 'big.png', size: 2 * 1024 * 1024 + 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('too_large');
  });

  it('refuses a file type that is not JPG, PNG or WebP', async () => {
    const user = await signedInAs();
    const res = await call('register-upload', user.token, { resourceType: 'PROFILE_IMAGE', filename: 'photo.gif', size: 100 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('wrong_type');
  });

  it('chooses the path on the server (the caller cannot)', async () => {
    const user = await signedInAs();
    const res = await call('register-upload', user.token, { resourceType: 'PROFILE_IMAGE', filename: '../../other-user/evil.png', size: 100, path: 'someone-else/x.png' });
    expect(res.status).toBe(200);
    expect(res.body.path.startsWith(`${user.userId}/`)).toBe(true);
    expect((await fileRow(res.body.fileId)).status).toBe('PENDING');
  });
});

describe('finalize-upload', () => {
  it('validates a real PNG and makes it the profile photo', async () => {
    const user = await signedInAs();
    const { fin } = await upload(user, 'me.png', PNG);
    expect(fin?.status).toBe(200);
    expect(fin?.body).toMatchObject({ status: 'VALIDATED', mimeType: 'image/png' });
    const [profile] = await serviceGet(`profiles?select=profile_image_file_id&id=eq.${user.userId}`);
    expect(profile.profile_image_file_id).toBe(fin?.body.fileId);
  });

  it('rejects a file whose bytes are not an image, whatever its name, and removes it', async () => {
    const user = await signedInAs();
    const { reg, fin } = await upload(user, 'fake.png', NOT_AN_IMAGE);
    expect(fin?.status).toBe(422);
    expect(fin?.body.code).toBe('rejected');
    expect((await fileRow(reg.body.fileId)).status).toBe('DELETED');
    const [profile] = await serviceGet(`profiles?select=profile_image_file_id&id=eq.${user.userId}`);
    expect(profile.profile_image_file_id).toBeNull();
  });

  it('a PENDING image is never shown: nobody can get a link to it', async () => {
    const owner = await signedInAs();
    const viewer = await signedInAs();
    const reg = await call('register-upload', owner.token, { resourceType: 'PROFILE_IMAGE', filename: 'p.png', size: PNG.length });
    const s = requireSupabase();
    const ownerStorage = createClient(s.url, s.anonKey, { global: { headers: { Authorization: `Bearer ${owner.token}` } }, auth: { persistSession: false } }).storage;
    await ownerStorage.from('profile-images').uploadToSignedUrl(reg.body.path, reg.body.token, PNG, { contentType: 'image/png' });
    for (const who of [owner, viewer]) {
      const storage = createClient(s.url, s.anonKey, { global: { headers: { Authorization: `Bearer ${who.token}` } }, auth: { persistSession: false } }).storage;
      const { data, error } = await storage.from('profile-images').createSignedUrl(reg.body.path, 60);
      expect(data?.signedUrl ?? null).toBeNull();
      expect(error).not.toBeNull();
    }
  });

  it('a VALIDATED image can be shown to another signed-in user', async () => {
    const owner = await signedInAs();
    const viewer = await signedInAs();
    const { reg } = await upload(owner, 'ok.jpg', JPEG);
    const s = requireSupabase();
    const storage = createClient(s.url, s.anonKey, { global: { headers: { Authorization: `Bearer ${viewer.token}` } }, auth: { persistSession: false } }).storage;
    const { data, error } = await storage.from('profile-images').createSignedUrl(reg.body.path, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toContain('profile-images');
  });

  it('replacing an image removes the old object', async () => {
    const user = await signedInAs();
    const first = await upload(user, 'one.png', PNG);
    const second = await upload(user, 'two.jpg', JPEG);
    expect(second.fin?.status).toBe(200);
    expect((await fileRow(first.reg.body.fileId)).status).toBe('DELETED');
    const s = requireSupabase();
    const objects = await fetch(`${s.url}/storage/v1/object/list/profile-images`, {
      method: 'POST',
      headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: `${user.userId}/` }),
    }).then((r) => r.json());
    const names = objects.map((/** @type {{ name: string }} */ o) => o.name);
    expect(names).not.toContain(first.reg.body.path.split('/')[1]);
    expect(names).toContain(second.reg.body.path.split('/')[1]);
  });

  it('a user cannot finalize someone else\'s upload', async () => {
    const owner = await signedInAs();
    const other = await signedInAs();
    const reg = await call('register-upload', owner.token, { resourceType: 'PROFILE_IMAGE', filename: 'x.png', size: PNG.length });
    expect((await call('finalize-upload', other.token, { fileId: reg.body.fileId })).status).toBe(404);
  });
});

describe('cleanup-files', () => {
  it('is for the scheduler only', async () => {
    const user = await signedInAs();
    expect((await call('cleanup-files', user.token, {})).status).toBe(403);
  });

  it('removes a profile image nobody uses any more', async () => {
    const user = await signedInAs();
    const { fin } = await upload(user, 'gone.png', PNG);
    // The user removes their photo (allowed column update on their own row).
    await user.client.from('profiles').update({ profile_image_file_id: null }).eq('id', user.userId);
    const s = requireSupabase();
    const res = await call('cleanup-files', s.serviceKey, {});
    expect(res.status).toBe(200);
    expect((await fileRow(fin?.body.fileId)).status).toBe('DELETED');
  });
});
