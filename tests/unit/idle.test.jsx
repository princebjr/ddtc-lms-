// @vitest-environment jsdom
// D43 (ADR-011; owner request and clarification 2026-11-07): idle sign-out for every role. Inactivity
// only: clicks, keys, scrolling, touch, focus, form input and moving to another page reset the clock,
// and so do audio playing, a recording and an upload; token refreshes and background requests do
// not. The warning opens after 8 idle minutes (Continue Session, or Escape, keeps the session) and
// the user is signed out after 10 consecutive idle minutes, with their drafts kept and the way back to
// the same page. One clock for every tab, compared by timestamps: a phone that slept past the limit,
// or a reload after it, signs out at once. Administrators also record activity on the server.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContextForTests } from '@/components/auth/AuthProvider.jsx';
import { IdleSessionProvider } from '@/components/auth/IdleSessionProvider.jsx';
import { holdAwake, markUnsaved } from '@/lib/auth/activity.js';
import { ACTIVITY_KEY, countdownAnnouncement, formatCountdown, formatSpan, idleLimits, idleState } from '@/lib/auth/idle.js';

const MIN = 60_000;

const db = vi.hoisted(() => ({
  settings: /** @type {unknown} */ (null),
  settingsFail: false,
  calls: /** @type {string[]} */ ([]),
}));
const toast = vi.hoisted(() => ({ show: vi.fn(), dismissId: vi.fn() }));

vi.mock('@/lib/supabase.js', () => ({
  getSupabase: () => ({
    rpc: async (/** @type {string} */ name) => {
      db.calls.push(name);
      if (name === 'idle_settings') return db.settingsFail ? { data: null, error: { message: 'offline' } } : { data: db.settings, error: null };
      return { data: null, error: null };
    },
  }),
}));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));

let visibility = 'visible';

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-07T10:00:00Z') });
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  localStorage.clear();
  db.settings = { timeout_minutes: 10, warning_seconds: 120 };
  db.settingsFail = false;
  db.calls = [];
  toast.show.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A Supabase access token for a session (only the payload is read). @param {string} session */
const token = (session) => `x.${btoa(JSON.stringify({ session_id: session })).replace(/=+$/, '')}.y`;

/** @param {number} ms */
function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function GoButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/learner/courses')}>
      Go
    </button>
  );
}

/**
 * Renders the signed-in idle provider and waits for the settings.
 * @param {{ role?: 'ADMIN' | 'LECTURER' | 'LEARNER', session?: string, path?: string }} [options]
 */
async function start({ role = 'LEARNER', session = 's1', path = '/learner/dashboard' } = {}) {
  const signOut = vi.fn(async () => {});
  const ui = (/** @type {string} */ accessToken) => (
    <AuthContextForTests.Provider
      value={/** @type {any} */ ({
        status: 'signed-in',
        session: { access_token: accessToken },
        profile: { id: 'u1', role },
        aal: 'aal1',
        nextAal: 'aal1',
        configured: true,
        signedOutTo: null,
        refresh: async () => {},
        signOut,
      })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<GoButton />} />
        </Routes>
        <IdleSessionProvider />
      </MemoryRouter>
    </AuthContextForTests.Provider>
  );
  const utils = render(ui(token(session)));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return {
    ...utils,
    signOut,
    /** TOKEN_REFRESHED: a new access token for the same session. */
    refreshToken: () => utils.rerender(ui(`${token(session)}refreshed`)),
  };
}

const dialog = () => screen.queryByRole('alertdialog');

describe('the idle warning and sign-out', () => {
  it('warns after 8 idle minutes and signs out after 10, keeping drafts and the way back to the page', async () => {
    const { signOut } = await start();
    advance(8 * MIN - 1000);
    expect(dialog()).toBeNull();
    advance(1000);
    const warning = screen.getByRole('alertdialog', { name: 'Your session ends in 2 minutes' });
    // Owner request 2026-11-11: the warning has a red border (the error colour), in both themes.
    expect(warning.className).toMatch(/border-2/);
    expect(warning.className).toMatch(/border-error/);
    // Owner request 2026-11-11: centred on every screen size (not a bottom sheet on phones), over a stronger dim.
    expect(warning.className).toMatch(/top-1\/2/);
    expect(warning.className).toMatch(/-translate-y-1\/2/);
    expect(warning.className).not.toMatch(/(^| )bottom-0( |$)/);
    expect(document.querySelector('[data-slot="alert-dialog-overlay"]')?.className).toMatch(/bg-scrim-strong/);
    expect(warning).toHaveTextContent('You have not used DDTC LMS for 8 minutes. Choose Continue Session to keep working.');
    expect(warning).not.toHaveTextContent('unsaved changes');
    expect(screen.getByRole('button', { name: 'Continue Session' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Sign out now' })).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    advance(2 * MIN);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ to: '/login?idle=10&next=%2Flearner%2Fdashboard', keepDrafts: true });
  });

  it('Continue Session starts the clock again', async () => {
    const { signOut } = await start();
    advance(8 * MIN);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Session' }));
    expect(dialog()).toBeNull();
    advance(8 * MIN - 1000);
    expect(dialog()).toBeNull();
    advance(1000);
    expect(dialog()).not.toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('Escape is the same as Continue Session', async () => {
    const { signOut } = await start();
    advance(8 * MIN);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(dialog()).toBeNull();
    advance(7 * MIN);
    expect(dialog()).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('Sign out now signs out at once (a deliberate sign-out, so drafts are not kept)', async () => {
    const { signOut } = await start();
    advance(8 * MIN);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }));
    });
    expect(signOut).toHaveBeenCalledWith({ to: '/login' });
    expect(toast.show).toHaveBeenCalledWith('account.signed-out');
  });

  it('says when a screen has unsaved work', async () => {
    await start();
    const release = markUnsaved();
    advance(8 * MIN);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('You have unsaved changes. If you are signed out, they are kept on this device as a draft for 24 hours.');
    release();
  });

  it('counts down; screen readers hear it at whole minutes and at 30 and 10 seconds', async () => {
    await start();
    advance(8 * MIN);
    const live = () => document.querySelector('[data-slot="idle-warning"] [aria-live="polite"]');
    expect(screen.getByTestId('idle-countdown')).toHaveTextContent('Signing out in 2:00');
    expect(live()).toHaveTextContent('2 minutes left');
    advance(1000);
    expect(screen.getByTestId('idle-countdown')).toHaveTextContent('Signing out in 1:59');
    expect(live()).toHaveTextContent('2 minutes left');
    advance(59_000);
    expect(live()).toHaveTextContent('1 minute left');
    advance(30_000);
    expect(live()).toHaveTextContent('30 seconds left');
    advance(20_000);
    expect(live()).toHaveTextContent('10 seconds left');
  });
});

describe('what counts as activity', () => {
  it.each(['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input', 'focusin', 'scroll'])('%s resets the clock', async (type) => {
    const { signOut } = await start();
    advance(7 * MIN);
    act(() => {
      window.dispatchEvent(new Event(type));
    });
    advance(7 * MIN);
    expect(dialog()).toBeNull();
    advance(MIN);
    expect(dialog()).not.toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('moving to another page resets the clock', async () => {
    await start();
    advance(7 * MIN);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    advance(7 * MIN);
    expect(dialog()).toBeNull();
  });

  it('audio playing, a recording or an upload keeps the session; then the clock runs again', async () => {
    const { signOut } = await start();
    const release = holdAwake();
    advance(30 * MIN);
    expect(dialog()).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
    release();
    advance(8 * MIN - 1000);
    expect(dialog()).toBeNull();
    advance(1000);
    expect(dialog()).not.toBeNull();
  });

  it('a token refresh does not count', async () => {
    const { signOut, refreshToken } = await start();
    advance(5 * MIN);
    refreshToken();
    advance(3 * MIN);
    expect(dialog()).not.toBeNull();
    advance(2 * MIN);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('while the warning is open, moving the mouse does not dismiss it; only Continue Session does', async () => {
    await start();
    advance(8 * MIN);
    act(() => {
      window.dispatchEvent(new Event('pointermove'));
      window.dispatchEvent(new Event('scroll'));
    });
    advance(1000);
    expect(dialog()).not.toBeNull();
  });
});

describe('settings', () => {
  it("follow the administrator's settings", async () => {
    db.settings = { timeout_minutes: 15, warning_seconds: 60 };
    const { signOut } = await start();
    advance(14 * MIN - 1000);
    expect(dialog()).toBeNull();
    advance(1000);
    expect(screen.getByRole('alertdialog', { name: 'Your session ends in 1 minute' })).toHaveTextContent('You have not used DDTC LMS for 14 minutes.');
    advance(MIN);
    expect(signOut).toHaveBeenCalledWith({ to: '/login?idle=15&next=%2Flearner%2Fdashboard', keepDrafts: true });
  });

  it('fall back to 10 minutes when they cannot be read', async () => {
    db.settingsFail = true;
    const { signOut } = await start();
    advance(10 * MIN);
    expect(signOut).toHaveBeenCalledWith(expect.objectContaining({ to: '/login?idle=10&next=%2Flearner%2Fdashboard' }));
  });
});

describe('one clock, compared by timestamps', () => {
  it('signs out at once when the page is seen again after the limit passed (a phone that slept)', async () => {
    const { signOut } = await start();
    advance(MIN);
    visibility = 'hidden';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Asleep: no timer runs; only time moves on.
    vi.setSystemTime(Date.now() + 11 * MIN);
    expect(signOut).not.toHaveBeenCalled();
    visibility = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(signOut).toHaveBeenCalledWith(expect.objectContaining({ keepDrafts: true }));
  });

  it('two tabs share one clock: activity in another tab keeps this one going and closes its warning', async () => {
    const { signOut } = await start();
    const otherTab = () =>
      act(() => {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify({ session: 's1', at: Date.now() }));
        window.dispatchEvent(new StorageEvent('storage', { key: ACTIVITY_KEY }));
      });
    advance(7 * MIN);
    otherTab();
    advance(7 * MIN);
    expect(dialog()).toBeNull();
    advance(MIN);
    expect(dialog()).not.toBeNull();
    otherTab();
    expect(dialog()).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('a reload after the limit had passed signs out at once; a new session starts a fresh clock', async () => {
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify({ session: 's1', at: Date.now() - 11 * MIN }));
    const reloaded = await start();
    advance(10);
    expect(reloaded.signOut).toHaveBeenCalledWith(expect.objectContaining({ keepDrafts: true }));
    reloaded.unmount();

    localStorage.setItem(ACTIVITY_KEY, JSON.stringify({ session: 's1', at: Date.now() - 11 * MIN }));
    const signedInAgain = await start({ session: 's2' });
    advance(7 * MIN);
    expect(signedInAgain.signOut).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? '{}').session).toBe('s2');
  });
});

describe('administrators', () => {
  it('record activity on the server at most once a minute, and at once for Continue Session', async () => {
    await start({ role: 'ADMIN', path: '/admin/dashboard' });
    const recorded = () => db.calls.filter((c) => c === 'record_activity').length;
    expect(recorded()).toBe(1);
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(recorded()).toBe(1);
    advance(61_000);
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(recorded()).toBe(2);
    advance(8 * MIN);
    fireEvent.click(screen.getByRole('button', { name: 'Continue Session' }));
    expect(recorded()).toBe(3);
  });

  it('learners and lecturers do not call the server for activity', async () => {
    await start();
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    expect(db.calls).toEqual(['idle_settings']);
  });
});

describe('limits and wording', () => {
  it('holds the settings to the database bounds, defaulting to 10 minutes and 2 minutes', () => {
    expect(idleLimits({ timeout_minutes: 10, warning_seconds: 120 })).toEqual({ timeoutMinutes: 10, timeoutMs: 600_000, warningMs: 120_000 });
    expect(idleLimits({ timeout_minutes: 60, warning_seconds: 30 })).toEqual({ timeoutMinutes: 60, timeoutMs: 3_600_000, warningMs: 30_000 });
    expect(idleLimits({ timeout_minutes: 4, warning_seconds: 181 })).toEqual({ timeoutMinutes: 10, timeoutMs: 600_000, warningMs: 120_000 });
    expect(idleLimits({ timeout_minutes: '15', warning_seconds: 12.5 })).toEqual({ timeoutMinutes: 10, timeoutMs: 600_000, warningMs: 120_000 });
    expect(idleLimits(null).timeoutMinutes).toBe(10);
  });

  it('is active, warned in the last 2 minutes, then expired', () => {
    const base = { lastActivity: 0, timeoutMs: 600_000, warningMs: 120_000 };
    expect(idleState({ ...base, now: 479_999 }).state).toBe('active');
    expect(idleState({ ...base, now: 480_000 })).toEqual({ state: 'warning', endsAt: 600_000 });
    expect(idleState({ ...base, now: 600_000 }).state).toBe('expired');
  });

  it('words spans and countdowns', () => {
    expect(formatSpan(120_000)).toBe('2 minutes');
    expect(formatSpan(60_000)).toBe('1 minute');
    expect(formatSpan(510_000)).toBe('8 minutes 30 seconds');
    expect(formatSpan(45_000)).toBe('45 seconds');
    expect(formatCountdown(120_000)).toBe('2:00');
    expect(formatCountdown(119_000)).toBe('1:59');
    expect(formatCountdown(4_200)).toBe('0:05');
    expect(countdownAnnouncement(120_000)).toBe('2 minutes left');
    expect(countdownAnnouncement(61_000)).toBe('2 minutes left');
    expect(countdownAnnouncement(60_000)).toBe('1 minute left');
    expect(countdownAnnouncement(30_000)).toBe('30 seconds left');
    expect(countdownAnnouncement(9_000)).toBe('10 seconds left');
    expect(countdownAnnouncement(0)).toBe('Signing out');
  });
});
