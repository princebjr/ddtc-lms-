// Ranged reads of a stored object with the service role, for finalize-upload: audio and document
// checks read only the bytes they need (headers, a ZIP's table of contents), never a whole 100 MB
// file. Used only after the caller has been checked.
import type { Reader } from './audio.ts';
import { HttpError } from './http.ts';

const URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export async function storageReader(bucket: string, path: string): Promise<Reader> {
  const url = `${URL}/storage/v1/object/authenticated/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

  const read = async (offset: number, length: number): Promise<Uint8Array> => {
    if (length <= 0) return new Uint8Array(0);
    const res = await fetch(url, { headers: { ...headers, Range: `bytes=${offset}-${offset + length - 1}` } });
    if (!res.ok) throw new HttpError(422, 'rejected', 'The file did not arrive. Try again.');
    const bytes = new Uint8Array(await res.arrayBuffer());
    // A server that ignores Range sends everything: cut out the requested part.
    return res.status === 206 ? bytes : bytes.subarray(offset, offset + length);
  };

  const first = await fetch(url, { headers: { ...headers, Range: 'bytes=0-0' } });
  if (!first.ok) throw new HttpError(422, 'rejected', 'The file did not arrive. Try again.');
  const total = Number(/\/(\d+)$/.exec(first.headers.get('Content-Range') ?? '')?.[1] ?? first.headers.get('Content-Length') ?? 0);
  await first.body?.cancel();
  return { size: total, read };
}
