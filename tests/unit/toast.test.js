// UI_FEEDBACK.md toast rules: durations, de-duplication with a count, at most 3 visible, Undo,
// pause on focus or hover, only catalogue toasts exist, and the catalogue matches the document.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { durationFor, MAX_VISIBLE_TOASTS, TOAST_DURATIONS, TOASTS } from '@/lib/toast/catalogue.js';
import { createToastController } from '@/lib/toast/controller.js';

/** @typedef {import('@/lib/toast/controller.js').ToastState} ToastState */

function setup() {
  /** @type {Map<string, ToastState>} */
  const shown = new Map();
  const renderer = {
    render: vi.fn((/** @type {ToastState} */ s) => void shown.set(s.key, s)),
    remove: vi.fn((/** @type {string} */ key) => void shown.delete(key)),
  };
  const clock = {
    setTimeout: (/** @type {() => void} */ fn, /** @type {number} */ ms) => setTimeout(fn, ms),
    clearTimeout: (/** @type {any} */ h) => clearTimeout(h),
    now: () => Date.now(),
  };
  return { controller: createToastController(renderer, clock), shown, renderer };
}

beforeEach(() => {
  vi.useFakeTimers();
  return () => vi.useRealTimers();
});

describe('durations (Section 16)', () => {
  it('success 4 s, info 5 s, warning 8 s, error until dismissed, Undo 6 s', () => {
    expect(TOAST_DURATIONS).toEqual({ success: 4000, info: 5000, warning: 8000, error: Number.POSITIVE_INFINITY, undo: 6000 });
  });

  it.each([
    ['profile.saved', 4000],
    ['account.signed-out', 5000],
    ['learner.submitted-late', 8000],
    ['admin.course-archived', 6000],
  ])('%s disappears after exactly %i ms', (id, ms) => {
    const { controller, shown } = setup();
    controller.show(/** @type {any} */ (id));
    vi.advanceTimersByTime(ms - 1);
    expect(shown.size).toBe(1);
    vi.advanceTimersByTime(1);
    expect(shown.size).toBe(0);
  });

  it('an error toast stays until dismissed and offers Retry', () => {
    const { controller, shown } = setup();
    const key = controller.show('request.failed');
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(shown.get(key)?.actionLabel).toBe('Retry');
    controller.dismiss(key);
    expect(shown.size).toBe(0);
  });

  it('"You are offline" stays until back online', () => {
    const { controller, shown } = setup();
    controller.show('network.offline');
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(shown.size).toBe(1);
    controller.dismissId('network.offline');
    expect(shown.size).toBe(0);
  });

  it('"New version available" stays and offers Refresh', () => {
    const { controller, shown } = setup();
    const key = controller.show('app.update-ready');
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(shown.get(key)?.actionLabel).toBe('Refresh');
  });

  it('every reversible catalogue toast uses the 6-second Undo duration', () => {
    for (const def of Object.values(TOASTS).filter((d) => d.undo)) expect(durationFor(def)).toBe(6000);
  });
});

describe('de-duplication', () => {
  it('never shows the same message twice at once; a burst becomes one toast with a count', () => {
    const { controller, shown } = setup();
    controller.show('admin.learner-added');
    controller.show('admin.learner-added');
    controller.show('admin.learner-added');
    expect(shown.size).toBe(1);
    expect([...shown.values()][0].count).toBe(3);
  });

  it('a repeat restarts the timer', () => {
    const { controller, shown } = setup();
    controller.show('profile.saved');
    vi.advanceTimersByTime(3000);
    controller.show('profile.saved');
    vi.advanceTimersByTime(3000);
    expect(shown.size).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(shown.size).toBe(0);
  });

  it('different text for the same id is a different toast', () => {
    const { controller, shown } = setup();
    controller.show('learner.file-rejected', { params: { reason: 'The file is too large' } });
    controller.show('learner.file-rejected', { params: { reason: 'This file type is not accepted' } });
    expect(shown.size).toBe(2);
  });
});

describe('at most 3 visible', () => {
  it('the limit is 3', () => expect(MAX_VISIBLE_TOASTS).toBe(3));

  it('a fourth toast removes the oldest timed toast', () => {
    const { controller, shown } = setup();
    controller.show('profile.saved');
    controller.show('account.password-changed');
    controller.show('admin.setting-saved');
    controller.show('admin.owner-changed');
    expect(shown.size).toBe(3);
    expect([...shown.values()].map((s) => s.id)).toEqual(['account.password-changed', 'admin.setting-saved', 'admin.owner-changed']);
  });

  it('errors and sticky toasts are never removed to make room', () => {
    const { controller, shown } = setup();
    controller.show('request.failed');
    controller.show('network.offline');
    controller.show('profile.saved');
    controller.show('admin.setting-saved');
    expect([...shown.values()].map((s) => s.id)).toEqual(['request.failed', 'network.offline', 'admin.setting-saved']);
  });
});

describe('Undo and buttons', () => {
  it('reversible actions show Undo; pressing it runs the handler once and closes the toast', () => {
    const { controller, shown } = setup();
    const undo = vi.fn();
    const key = controller.show('admin.course-archived', { onAction: undo });
    expect(shown.get(key)?.actionLabel).toBe('Undo');
    controller.runAction(key);
    controller.runAction(key);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(shown.size).toBe(0);
  });

  it('catalogue buttons are passed through (Retry, Refresh, View, Download)', () => {
    const { controller, shown } = setup();
    expect(shown.get(controller.show('learner.grade-released'))?.actionLabel).toBe('View');
    expect(shown.get(controller.show('admin.export-ready'))?.actionLabel).toBe('Download');
    expect(shown.get(controller.show('profile.saved'))?.actionLabel).toBeUndefined();
  });
});

describe('pause while focused or hovered', () => {
  it('pausing stops the clock and resuming continues with the time left', () => {
    const { controller, shown } = setup();
    const key = controller.show('profile.saved');
    vi.advanceTimersByTime(3000);
    controller.pause(key);
    vi.advanceTimersByTime(60_000);
    expect(shown.size).toBe(1);
    controller.resume(key);
    vi.advanceTimersByTime(999);
    expect(shown.size).toBe(1);
    vi.advanceTimersByTime(1);
    expect(shown.size).toBe(0);
  });
});

describe('only catalogue toasts exist (D37)', () => {
  it('an unknown id throws', () => {
    const { controller } = setup();
    expect(() => controller.show(/** @type {any} */ ('made.up'))).toThrow(/Only toasts in docs\/UI_FEEDBACK.md exist/);
  });

  it('a missing parameter throws', () => {
    const { controller } = setup();
    expect(() => controller.show('learner.resubmitted')).toThrow(/needs the "n" parameter/);
  });

  it('only the toast provider imports the toast library', () => {
    /** @param {string} dir @returns {string[]} */
    const files = (dir) =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? files(p) : /\.(js|jsx)$/.test(n) ? [p] : [];
      });
    const importers = files('src')
      .filter((f) => /from ['"]sonner['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(/\\/g, '/'));
    expect(importers).toEqual(['src/components/feedback/ToastProvider.jsx']);
  });
});

describe('the catalogue matches docs/UI_FEEDBACK.md exactly', () => {
  const doc = readFileSync('docs/UI_FEEDBACK.md', 'utf8');
  const table = doc.slice(doc.indexOf('### Toast catalogue'), doc.indexOf('### Floating action buttons'));
  const TYPE = /** @type {const} */ ({ S: 'success', I: 'info', W: 'warning', E: 'error' });

  /** Rows of the document table as "text|type|button". */
  const documented = new Set();
  for (const line of table.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6 || !cells[3].includes('(')) continue;
    const [, , , toastCell, buttonCell] = cells;
    const texts = [...toastCell.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (toastCell.startsWith('Notification title')) texts.push('Notification title');
    const types = [...(toastCell.match(/\(([SIWE](?: or [SIWE])?)/)?.[1] ?? '').matchAll(/[SIWE]/g)].map((m) => TYPE[/** @type {'S'} */ (m[0])]);
    const button = buttonCell === 'none' ? '' : buttonCell;
    for (const text of texts) for (const type of types) documented.add(`${text}|${type}|${button}`);
  }

  const SAMPLE = { n: 'N', m: 'M', name: 'name', reason: 'reason', size: 'size', title: 'Notification title' };
  const implemented = new Set(
    Object.values(TOASTS).map((def) => `${def.text(SAMPLE)}|${def.type}|${def.undo ? 'Undo' : (def.action ?? '')}`),
  );

  it('the document table was parsed', () => expect(documented.size).toBeGreaterThan(60));
  it('every documented toast is implemented', () => expect([...documented].filter((d) => !implemented.has(d))).toEqual([]));
  it('no toast exists that is not documented', () => expect([...implemented].filter((i) => !documented.has(i))).toEqual([]));
});
