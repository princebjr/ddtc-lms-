// @vitest-environment jsdom
// Phase 15 (D45): the in-memory data layer. Memory only, per person, emptied on sign-out (including the idle
// sign-out) and when another person signs in; one request per key at a time; a fresh answer is reused, an older
// one is shown while asking again; writes make every answer count as old; a failed refresh keeps the last answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cached, invalidate, markAllStale, peek, prefetch, sessionUserId, updateCached } from '@/lib/data-cache.js';
import { clearPrivateCaches } from '@/lib/private-caches.js';

/** Puts a Supabase session for the user in this browser's storage, as supabase-js keeps it. @param {string} id */
const signIn = (id) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'x', user: { id } }));

beforeEach(() => {
  localStorage.clear();
  clearPrivateCaches();
  signIn('learner-1');
});
afterEach(() => vi.useRealTimers());

describe('the data layer', () => {
  it('reads the signed-in user from the stored session, and nobody when there is none', () => {
    expect(sessionUserId()).toBe('learner-1');
    localStorage.clear();
    expect(sessionUserId()).toBe('');
  });

  it('shares one request between a prefetch and the screen that opens', async () => {
    const fetcher = vi.fn(async () => ({ title: 'Genesis' }));
    prefetch('lesson:c:l', fetcher);
    await expect(cached('lesson:c:l', fetcher)).resolves.toEqual({ title: 'Genesis' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reuses an answer younger than 10 seconds, and asks again after that', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => 'v');
    await cached('k', fetcher);
    await cached('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(11_000);
    await cached('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the last answer for an instant display (peek), and force always asks again', async () => {
    const fetcher = vi.fn(async () => 'v1');
    await cached('k', fetcher);
    expect(peek('k')).toBe('v1');
    fetcher.mockResolvedValueOnce('v2');
    await expect(cached('k', fetcher, { force: true })).resolves.toBe('v2');
    expect(peek('k')).toBe('v2');
  });

  it('after a write every answer counts as old: the next read asks again, the old one still shows meanwhile', async () => {
    const fetcher = vi.fn(async () => 'before');
    await cached('course:c', fetcher);
    markAllStale();
    expect(peek('course:c')).toBe('before');
    fetcher.mockResolvedValueOnce('after');
    await expect(cached('course:c', fetcher)).resolves.toBe('after');
  });

  it('a failed refresh keeps the last answer; a failed first read leaves nothing cached', async () => {
    await cached('k', async () => 'good', { force: true });
    await expect(cached('k', async () => Promise.reject(new Error('offline')), { force: true })).rejects.toThrow('offline');
    expect(peek('k')).toBe('good');
    await expect(cached('new', async () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(peek('new')).toBeUndefined();
  });

  it('is per person: another user never sees the first one\'s answers', async () => {
    await cached('my-assignments', async () => ['learner-1 work']);
    signIn('learner-2');
    expect(peek('my-assignments')).toBeUndefined();
    signIn('learner-1');
    expect(peek('my-assignments')).toBeUndefined(); // switching people emptied it
  });

  it('is emptied on sign-out (the idle sign-out included) and caches nothing when signed out', async () => {
    await cached('k', async () => 'private');
    clearPrivateCaches();
    expect(peek('k')).toBeUndefined();
    localStorage.clear();
    const fetcher = vi.fn(async () => 'x');
    await cached('k', fetcher);
    await cached('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(peek('k')).toBeUndefined();
  });

  it('keeps at most 50 answers, dropping the oldest', async () => {
    for (let i = 0; i < 55; i += 1) await cached(`k${i}`, async () => i);
    expect(peek('k0')).toBeUndefined();
    expect(peek('k4')).toBeUndefined();
    expect(peek('k5')).toBe(5);
    expect(peek('k54')).toBe(54);
  });

  it('updates an answer in place (optimistic change) and forgets by prefix', async () => {
    await cached('lesson:c:1', async () => ({ done: false }));
    await cached('lesson:c:2', async () => ({ done: false }));
    updateCached('lesson:c:1', (/** @type {{ done: boolean }} */ p) => ({ ...p, done: true }));
    expect(peek('lesson:c:1')).toEqual({ done: true });
    invalidate('lesson:c:');
    expect(peek('lesson:c:1')).toBeUndefined();
    expect(peek('lesson:c:2')).toBeUndefined();
  });
});
