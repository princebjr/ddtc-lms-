// Toast controller: enforces the Section 16 rules independently of the rendering library.
// - durations per type (success 4 s, info 5 s, warning 8 s, error until dismissed, Undo 6 s)
// - the same message is never shown twice at once; a burst becomes one toast with a count
// - at most 3 visible: a fourth toast removes the oldest timed toast; errors and sticky toasts
//   are never removed to make room (the renderer also caps visible toasts at 3)
// - timers pause while a toast is focused or hovered and resume afterwards
// - only catalogue ids are accepted

import { durationFor, MAX_VISIBLE_TOASTS, TOASTS } from './catalogue.js';

/** @typedef {import('./catalogue.js').ToastId} ToastId */
/** @typedef {import('./catalogue.js').ToastType} ToastType */

/**
 * @typedef {object} ToastState
 * @property {string} key       stable identity: catalogue id plus message text
 * @property {ToastId} id
 * @property {ToastType} type
 * @property {string} text
 * @property {number} count     how many identical events this toast represents
 * @property {string | undefined} actionLabel  'Undo' for reversible actions, else the catalogue button
 * @property {number} duration  milliseconds, or Infinity
 */

/**
 * @typedef {object} ShowOptions
 * @property {Record<string, string | number>} [params]
 * @property {() => void} [onAction] runs when the toast's button (Undo, Retry, ...) is pressed
 */

/**
 * @typedef {object} ToastRenderer
 * @property {(state: ToastState) => void} render  create or update a toast
 * @property {(key: string) => void} remove
 */

/**
 * @typedef {object} Clock
 * @property {(fn: () => void, ms: number) => unknown} setTimeout
 * @property {(handle: unknown) => void} clearTimeout
 * @property {() => number} now
 */

/** @type {Clock} */
const realClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (handle)),
  now: () => Date.now(),
};

/**
 * @param {ToastRenderer} renderer
 * @param {Clock} [clock]
 */
export function createToastController(renderer, clock = realClock) {
  /**
   * @typedef {object} Entry
   * @property {ToastState} state
   * @property {(() => void) | undefined} onAction
   * @property {unknown} timer
   * @property {number} remaining
   * @property {number} startedAt
   * @property {boolean} paused
   */
  /** @type {Map<string, Entry>} insertion order = age */
  const active = new Map();

  /** @param {Entry} entry */
  function startTimer(entry) {
    clock.clearTimeout(entry.timer);
    entry.timer = undefined;
    if (!Number.isFinite(entry.remaining) || entry.paused) return;
    entry.startedAt = clock.now();
    entry.timer = clock.setTimeout(() => dismiss(entry.state.key), entry.remaining);
  }

  /** @param {string} key */
  function dismiss(key) {
    const entry = active.get(key);
    if (!entry) return;
    clock.clearTimeout(entry.timer);
    active.delete(key);
    renderer.remove(key);
  }

  function enforceLimit() {
    while (active.size > MAX_VISIBLE_TOASTS) {
      const oldestTimed = [...active.values()].find((e) => Number.isFinite(e.state.duration));
      if (!oldestTimed) return;
      dismiss(oldestTimed.state.key);
    }
  }

  /**
   * @param {ToastId} id
   * @param {ShowOptions} [options]
   * @returns {string} the toast key
   */
  function show(id, options = {}) {
    const def = TOASTS[id];
    if (!def) throw new Error(`Unknown toast "${String(id)}". Only toasts in docs/UI_FEEDBACK.md exist.`);
    const params = options.params ?? {};
    for (const name of def.params ?? []) {
      if (params[name] === undefined || params[name] === '') throw new Error(`Toast "${id}" needs the "${name}" parameter.`);
    }
    const text = def.text(params);
    const key = `${id}::${text}`;
    const duration = durationFor(def);

    const existing = active.get(key);
    if (existing) {
      existing.state = { ...existing.state, count: existing.state.count + 1 };
      existing.onAction = options.onAction ?? existing.onAction;
      existing.remaining = duration;
      startTimer(existing);
      renderer.render(existing.state);
      return key;
    }

    /** @type {Entry} */
    const entry = {
      state: { key, id, type: def.type, text, count: 1, actionLabel: def.undo ? 'Undo' : def.action, duration },
      onAction: options.onAction,
      timer: undefined,
      remaining: duration,
      startedAt: clock.now(),
      paused: false,
    };
    active.set(key, entry);
    renderer.render(entry.state);
    startTimer(entry);
    enforceLimit();
    return key;
  }

  /** @param {string} key */
  function pause(key) {
    const entry = active.get(key);
    if (!entry || entry.paused) return;
    if (Number.isFinite(entry.remaining)) {
      entry.remaining = Math.max(0, entry.remaining - (clock.now() - entry.startedAt));
    }
    entry.paused = true;
    clock.clearTimeout(entry.timer);
    entry.timer = undefined;
  }

  /** @param {string} key */
  function resume(key) {
    const entry = active.get(key);
    if (!entry || !entry.paused) return;
    entry.paused = false;
    startTimer(entry);
  }

  /** @param {string} key */
  function runAction(key) {
    const entry = active.get(key);
    if (!entry) return;
    const action = entry.onAction;
    dismiss(key);
    action?.();
  }

  /** Dismiss every toast with this catalogue id (for example "You are offline" when back online). */
  /** @param {ToastId} id */
  function dismissId(id) {
    for (const entry of [...active.values()]) if (entry.state.id === id) dismiss(entry.state.key);
  }

  return {
    show,
    dismiss,
    dismissId,
    pause,
    resume,
    runAction,
    /** @returns {ToastState[]} oldest first */
    list: () => [...active.values()].map((e) => e.state),
  };
}

/** @typedef {ReturnType<typeof createToastController>} ToastController */
