import { draftsStopped, onStopDrafts } from '@/lib/drafts.js';

// Recording drafts (D43, ADR-011; Phase 8): a recording in progress is saved on this device, piece
// by piece as the recorder hands it over (every second), so a page that closes, an idle or session
// sign-out, or a crash keeps what was recorded. It is put back for review when the same user opens
// the same screen again, for 24 hours. Kept in IndexedDB (audio is too large for local storage);
// deleted by a deliberate sign-out, by Use recording, Re-record and Discard. If the browser has no
// IndexedDB (a private window, for example) nothing is kept and recording still works.

export const RECORDING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DB_NAME = 'ddtc-recordings';
const DB_VERSION = 1;

/** @typedef {{ draft: string, userId: string, mimeType: string, seconds: number, updatedAt: number }} DraftMeta */

/** @returns {Promise<IDBDatabase | null>} */
function open() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'draft' });
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { autoIncrement: true }).createIndex('draft', 'draft');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Runs `work` in one transaction over both stores and resolves when it commits.
 * @template T
 * @param {(stores: { meta: IDBObjectStore, chunks: IDBObjectStore }) => T} work
 * @returns {Promise<T | null>}
 */
async function inTransaction(work) {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(['meta', 'chunks'], 'readwrite');
      const result = work({
        meta: tx.objectStore('meta'),
        chunks: tx.objectStore('chunks'),
      });
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
      tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/** @param {IDBRequest} req @returns {Promise<any>} */
const result = (req) =>
  new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

const draftId = (/** @type {string} */ userId, /** @type {string} */ key) => `${userId}:${key}`;

/** Deletes every chunk of one draft (inside a transaction). @param {IDBObjectStore} chunks @param {string} draft */
function deleteChunks(chunks, draft) {
  const cursor = chunks.index('draft').openKeyCursor(IDBKeyRange.only(draft));
  cursor.onsuccess = () => {
    const c = cursor.result;
    if (!c) return;
    chunks.delete(c.primaryKey);
    c.continue();
  };
}

/** Starts a new recording draft for this screen (an earlier one is replaced). @param {string} userId @param {string} key @param {string} mimeType */
export async function startRecordingDraft(userId, key, mimeType, now = Date.now()) {
  if (draftsStopped(userId)) return;
  const draft = draftId(userId, key);
  await inTransaction(({ meta, chunks }) => {
    deleteChunks(chunks, draft);
    meta.put(
      /** @type {DraftMeta} */ ({
        draft,
        userId,
        mimeType,
        seconds: 0,
        updatedAt: now,
      }),
    );
  });
}

/** Adds the next piece of the recording. @param {string} userId @param {string} key @param {Blob} chunk @param {number} seconds */
export async function appendRecordingChunk(userId, key, chunk, seconds, now = Date.now()) {
  if (draftsStopped(userId) || !chunk.size) return;
  const draft = draftId(userId, key);
  // Kept as bytes: some browsers (older iPhones) failed to store Blobs in IndexedDB.
  const bytes = await chunk.arrayBuffer();
  await inTransaction(({ meta, chunks }) => {
    chunks.add({ draft, bytes });
    const get = meta.get(draft);
    get.onsuccess = () => {
      if (get.result) meta.put({ ...get.result, seconds, updatedAt: now });
    };
  });
}

/**
 * This screen's recording draft, or null (none, older than 24 hours, or no IndexedDB).
 * @param {string} userId @param {string} key
 * @returns {Promise<{ blob: Blob, mimeType: string, seconds: number, updatedAt: number } | null>}
 */
export async function loadRecordingDraft(userId, key, now = Date.now()) {
  const db = await open();
  if (!db) return null;
  const draft = draftId(userId, key);
  try {
    const tx = db.transaction(['meta', 'chunks'], 'readonly');
    // Both requests go out before waiting, so the transaction stays open for them.
    const [found, chunks] = await Promise.all([
      result(tx.objectStore('meta').get(draft)),
      result(tx.objectStore('chunks').index('draft').getAll(IDBKeyRange.only(draft))),
    ]);
    const meta = /** @type {DraftMeta | undefined} */ (found ?? undefined);
    const rows = /** @type {Array<{ bytes: ArrayBuffer }> | null} */ (chunks);
    db.close();
    if (!meta) return null;
    if (now - meta.updatedAt > RECORDING_DRAFT_TTL_MS || !rows?.length) {
      await clearRecordingDraft(userId, key);
      return null;
    }
    return {
      blob: new Blob(
        rows.map((r) => r.bytes),
        { type: meta.mimeType },
      ),
      mimeType: meta.mimeType,
      seconds: meta.seconds,
      updatedAt: meta.updatedAt,
    };
  } catch {
    db.close();
    return null;
  }
}

/** @param {string} userId @param {string} key */
export async function clearRecordingDraft(userId, key) {
  const draft = draftId(userId, key);
  await inTransaction(({ meta, chunks }) => {
    deleteChunks(chunks, draft);
    meta.delete(draft);
  });
}

/** Deletes every recording draft of a user (a deliberate sign-out). @param {string} userId */
export async function clearUserRecordings(userId) {
  await inTransaction(({ meta, chunks }) => {
    const cursor = meta.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      const row = /** @type {DraftMeta} */ (c.value);
      if (row.userId === userId) {
        deleteChunks(chunks, row.draft);
        c.delete();
      }
      c.continue();
    };
  });
}

onStopDrafts((userId) => {
  void clearUserRecordings(userId);
});
