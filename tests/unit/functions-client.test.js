// The Edge Function client never leaves the screen waiting forever: a call that does not answer
// within FUNCTION_TIMEOUT_MS ends with a clear "taking too long" error (found in Phase 6 when a
// stopped server worker left an upload on "Checking the file…").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase.js', () => ({
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } }),
}));
vi.mock('@/lib/env.js', () => ({
  parsePublicEnv: () => ({ VITE_SUPABASE_URL: 'https://example.test', VITE_SUPABASE_ANON_KEY: 'anon' }),
}));

const { callFunction, FUNCTION_TIMEOUT_MS, FunctionError } = await import('@/lib/functions.js');

describe('callFunction', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up with a clear message when the server never answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (/** @type {string} */ _url, /** @type {RequestInit} */ init) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      ),
    );
    const call = callFunction('finalize-upload', { fileId: 'x' });
    const outcome = expect(call).rejects.toMatchObject({ code: 'timeout', message: 'This is taking too long. Check your connection and try again.' });
    await vi.advanceTimersByTimeAsync(FUNCTION_TIMEOUT_MS + 1);
    await outcome;
  });

  it('still reports being offline when the request cannot be sent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(callFunction('finalize-upload', { fileId: 'x' })).rejects.toMatchObject({ code: 'network' });
  });

  it('passes the server error on, and returns the answer when it arrives in time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'rejected', message: 'The file is empty.' }), { status: 422 })));
    const err = await callFunction('finalize-upload', { fileId: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(FunctionError);
    expect(err).toMatchObject({ status: 422, code: 'rejected', message: 'The file is empty.' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(callFunction('finalize-upload', { fileId: 'x' })).resolves.toEqual({ ok: true });
  });

  // Found in Phase 8: under load the Supabase gateway answered for a function with its own text
  // ("Worker failed to respond due to a resource limit (please check logs)"), and the extension
  // dialog showed it word for word. Only our functions' messages (lowercase codes) reach the screen.
  it.each([
    [546, { code: 'WORKER_LIMIT', message: 'Worker failed to respond due to a resource limit (please check logs)' }],
    [503, { code: 'BOOT_ERROR', message: 'Function failed to start (please check logs)' }],
    [502, { message: 'An invalid response was received from the upstream server' }],
    [500, 'Internal Server Error'],
  ])('shows a plain message when the platform, not our function, answers %i', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })));
    const err = await callFunction('manage-assignments', { action: 'extension-set' }).catch((e) => e);
    expect(err).toBeInstanceOf(FunctionError);
    expect(err).toMatchObject({ status, code: 'server_error', message: 'Something went wrong. Try again.' });
  });
});
