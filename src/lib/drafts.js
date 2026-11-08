// Unsaved work kept on this device (D43, ADR-011): one draft per user and screen, for 24 hours, so
// work survives an idle sign-out and is put back when the same user returns. A deliberate sign-out
// deletes the user's drafts (and stops screens that are closing from writing them again).

const PREFIX = 'ddtc:draft:';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/** The user whose drafts are being deleted by a deliberate sign-out; nothing is saved for them. */
let stopped = /** @type {string | null} */ (null);

/** @param {string} userId @param {string} key */
const storageKey = (userId, key) => `${PREFIX}${userId}:${key}`;

/** @returns {Storage | null} */
function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * A short fingerprint of saved values, so a draft is only put back over the version it was made from.
 * @param {unknown} value
 */
export function fingerprint(value) {
  const text = JSON.stringify(value) ?? '';
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${(hash >>> 0).toString(36)}.${text.length}`;
}

/**
 * @param {string} userId @param {string} key
 * @param {string | null} base  fingerprint of the saved version the draft was made from (null for a new item)
 * @param {unknown} data
 * @param {number} [now]
 */
export function saveDraft(userId, key, base, data, now = Date.now()) {
  if (userId === stopped) return;
  try {
    store()?.setItem(storageKey(userId, key), JSON.stringify({ base, data, savedAt: now }));
  } catch {
    // Full or unavailable: the work stays on screen only.
  }
}

/**
 * The draft, or null when there is none or it is older than 24 hours (then it is deleted).
 * @param {string} userId @param {string} key @param {number} [now]
 * @returns {{ base: string | null, data: any, savedAt: number } | null}
 */
export function loadDraft(userId, key, now = Date.now()) {
  const s = store();
  if (!s) return null;
  try {
    const raw = JSON.parse(s.getItem(storageKey(userId, key)) ?? 'null');
    if (!raw || typeof raw.savedAt !== 'number') return null;
    if (now - raw.savedAt > DRAFT_TTL_MS) {
      s.removeItem(storageKey(userId, key));
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/** @param {string} userId @param {string} key */
export function clearDraft(userId, key) {
  try {
    store()?.removeItem(storageKey(userId, key));
  } catch {
    // Nothing to do.
  }
}

/** Deletes every draft of a user. @param {string} userId */
export function clearUserDrafts(userId) {
  const s = store();
  if (!s) return;
  const prefix = `${PREFIX}${userId}:`;
  for (const k of Object.keys(s)) if (k.startsWith(prefix)) s.removeItem(k);
}

/** Deletes drafts older than 24 hours, whoever they belong to. @param {number} [now] */
export function purgeExpiredDrafts(now = Date.now()) {
  const s = store();
  if (!s) return;
  for (const k of Object.keys(s)) {
    if (!k.startsWith(PREFIX)) continue;
    try {
      const raw = JSON.parse(s.getItem(k) ?? 'null');
      if (!raw || typeof raw.savedAt !== 'number' || now - raw.savedAt > DRAFT_TTL_MS) s.removeItem(k);
    } catch {
      s.removeItem(k);
    }
  }
}

/** A deliberate sign-out: deletes the user's drafts and saves no more for them until the next sign-in. @param {string} userId */
export function stopDrafts(userId) {
  stopped = userId;
  clearUserDrafts(userId);
}

/** A sign-in: drafts are saved again. */
export function resumeDrafts() {
  stopped = null;
}
