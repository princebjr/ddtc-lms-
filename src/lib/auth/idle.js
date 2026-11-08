// D43 (ADR-011): every role is signed out after a period without activity (10 minutes by default),
// warned shortly before. One clock rules every tab of the browser: the time of the session's last
// activity, kept in localStorage under ddtc:lastActivity with the session it belongs to. Times are
// compared as timestamps, never counted intervals, so a phone that slept past the limit is signed
// out the moment the page is seen again.

export const IDLE_DEFAULTS = Object.freeze({ timeoutMinutes: 10, warningSeconds: 120 });

/** The shared clock in localStorage: {"session": "<session id>", "at": <ms>}. */
export const ACTIVITY_KEY = 'ddtc:lastActivity';

/** The shared clock is written at most this often; activity in between is kept in memory. */
export const WRITE_EVERY_MS = 5_000;

/** How often the clock is checked while the page is visible. */
export const CHECK_EVERY_MS = 1_000;

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function wholeBetween(value, min, max, fallback) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/**
 * The limits from idle_settings(), held to the database's bounds (5 to 60 minutes; a warning of 30
 * to 180 seconds). Anything else falls back to the defaults.
 * @param {{ timeout_minutes?: unknown, warning_seconds?: unknown } | null | undefined} raw
 * @returns {{ timeoutMinutes: number, timeoutMs: number, warningMs: number }}
 */
export function idleLimits(raw) {
  const timeoutMinutes = wholeBetween(raw?.timeout_minutes, 5, 60, IDLE_DEFAULTS.timeoutMinutes);
  const warningSeconds = wholeBetween(raw?.warning_seconds, 30, 180, IDLE_DEFAULTS.warningSeconds);
  return { timeoutMinutes, timeoutMs: timeoutMinutes * 60_000, warningMs: warningSeconds * 1000 };
}

/**
 * Where a session stands: active, warned (the last `warningMs` before the end) or expired.
 * @param {{ lastActivity: number, now: number, timeoutMs: number, warningMs: number }} s
 * @returns {{ state: 'active' | 'warning' | 'expired', endsAt: number }}
 */
export function idleState({ lastActivity, now, timeoutMs, warningMs }) {
  const endsAt = lastActivity + timeoutMs;
  if (now >= endsAt) return { state: 'expired', endsAt };
  if (endsAt - now <= warningMs) return { state: 'warning', endsAt };
  return { state: 'active', endsAt };
}

/**
 * The session's last activity in any tab, or null when none is recorded for this session.
 * @param {string} session
 * @returns {number | null}
 */
export function readLastActivity(session) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(ACTIVITY_KEY) ?? 'null');
    return raw && raw.session === session && Number.isFinite(raw.at) ? Number(raw.at) : null;
  } catch {
    return null;
  }
}

/** @param {string} session @param {number} at */
export function writeLastActivity(session, at) {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, JSON.stringify({ session, at }));
  } catch {
    // Storage unavailable: this tab keeps its own clock.
  }
}

/**
 * A span in words: "2 minutes", "1 minute", "8 minutes 30 seconds", "45 seconds".
 * @param {number} ms
 */
export function formatSpan(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const part = (/** @type {number} */ n, /** @type {string} */ unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (!minutes) return part(seconds, 'second');
  return seconds ? `${part(minutes, 'minute')} ${part(seconds, 'second')}` : part(minutes, 'minute');
}

/**
 * A countdown: "1:59", "0:05".
 * @param {number} ms
 */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * What a polite live region says as the end comes near. The text only changes at whole minutes and
 * at 30 and 10 seconds, so screen readers announce those moments and not every second.
 * @param {number} ms
 */
export function countdownAnnouncement(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (total === 0) return 'Signing out';
  if (total <= 10) return '10 seconds left';
  if (total <= 30) return '30 seconds left';
  const minutes = Math.ceil(total / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'} left`;
}
