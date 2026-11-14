// Phase 15 (D45 stability): database requests have a time limit, and only reads are retried, after a network
// failure or a temporary server answer (502, 503, 504), at most twice, with growing, spread-out waits. A write is
// never repeated; a refusal (4xx) is never retried; a request the caller cancels stops at once.
import { describe, expect, it, vi } from 'vitest';
import { isSafeRead, resilientFetch, retryDelay } from '@/lib/resilient-fetch.js';

const API = 'http://127.0.0.1:54321/rest/v1';
const ok = () => new Response('{}', { status: 200 });
const status = (/** @type {number} */ s) => new Response('{}', { status: s });
const noWait = () => Promise.resolve();

describe('which requests are reads', () => {
  it('GET and HEAD, and the named read-only database functions', () => {
    expect(isSafeRead(`${API}/lessons?select=id`, 'GET')).toBe(true);
    expect(isSafeRead(`${API}/notifications?select=id`, 'HEAD')).toBe(true);
    expect(isSafeRead(`${API}/rpc/get_lesson_page`, 'POST')).toBe(true);
    expect(isSafeRead(`${API}/rpc/client_settings`, 'POST')).toBe(true);
  });
  it('never a write: table changes and other database functions', () => {
    expect(isSafeRead(`${API}/lessons?id=eq.1`, 'PATCH')).toBe(false);
    expect(isSafeRead(`${API}/notifications`, 'POST')).toBe(false);
    expect(isSafeRead(`${API}/rpc/mark_lesson`, 'POST')).toBe(false);
    expect(isSafeRead(`${API}/rpc/notifications_clear`, 'POST')).toBe(false);
    expect(isSafeRead(`${API}/rpc/get_lesson_page_and_write`, 'POST')).toBe(false);
  });
});

describe('resilientFetch', () => {
  it('retries a read after a network failure and a temporary answer, then succeeds', async () => {
    const base = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok());
    const res = await resilientFetch(base, { wait: noWait })(`${API}/rpc/get_lesson_page`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it('gives up after two retries', async () => {
    const base = vi.fn().mockResolvedValue(status(502));
    const res = await resilientFetch(base, { wait: noWait })(`${API}/lessons`, { method: 'GET' });
    expect(res.status).toBe(502);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it('never retries a write, even after a network failure', async () => {
    const base = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(resilientFetch(base, { wait: noWait })(`${API}/rpc/mark_lesson`, { method: 'POST', body: '{}' })).rejects.toThrow('Failed to fetch');
    expect(base).toHaveBeenCalledTimes(1);
    const base2 = vi.fn().mockResolvedValue(status(503));
    expect((await resilientFetch(base2, { wait: noWait })(`${API}/notifications`, { method: 'POST' })).status).toBe(503);
    expect(base2).toHaveBeenCalledTimes(1);
  });

  it('never retries a refusal or a missing row (4xx)', async () => {
    const base = vi.fn().mockResolvedValue(status(403));
    expect((await resilientFetch(base, { wait: noWait })(`${API}/lessons`, { method: 'GET' })).status).toBe(403);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('gives up on a request that hangs, once its time limit passes', async () => {
    vi.useFakeTimers();
    try {
      /** @type {typeof fetch} */
      const hang = (_input, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
      const pending = resilientFetch(hang, { timeoutMs: 1000, retries: 0 })(`${API}/rpc/mark_lesson`, { method: 'POST' });
      const settled = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
      await vi.advanceTimersByTimeAsync(1000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops at once, without retrying, when the caller cancels', async () => {
    const controller = new AbortController();
    /** @type {typeof fetch} */
    const hang = (_input, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    const base = vi.fn(hang);
    const pending = resilientFetch(base, { wait: noWait })(`${API}/lessons`, { method: 'GET', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('waits about 0.5 s then 1 s, each with up to 50% spread', () => {
    expect(retryDelay(0, () => 0)).toBe(500);
    expect(retryDelay(0, () => 1)).toBe(750);
    expect(retryDelay(1, () => 0)).toBe(1000);
    expect(retryDelay(1, () => 1)).toBe(1500);
  });
});
