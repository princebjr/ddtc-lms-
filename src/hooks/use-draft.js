import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { clearDraft, fingerprint, loadDraft, saveDraft } from '@/lib/drafts.js';
import { useUnsavedWork } from './use-keep-awake.js';

// Drafts for editors (D43, ADR-011): unsaved work is kept on this device while it differs from what
// is saved, and put back (with "Draft restored") when the same user opens the same screen again, as
// after an idle sign-out. A draft is only put back over the saved version it was made from, so a
// co-lecturer's newer save is never overwritten; a new item's draft is always put back.

/**
 * The values an editor starts from: this screen's draft, or the saved values.
 * @template {Record<string, unknown>} T
 * @param {string} key  the screen, for example `lesson:<course id>:<lesson id or new>`
 * @param {T} saved
 * @param {{ isNew?: boolean }} [options]
 * @returns {T}
 */
export function useDraftStart(key, saved, { isNew = false } = {}) {
  const auth = useAuth();
  const toast = useToast();
  const userId = auth.profile?.id;
  const [start] = useState(() => {
    if (!userId) return { value: saved, restored: false };
    const draft = loadDraft(userId, key);
    if (draft && draft.data && typeof draft.data === 'object' && (isNew || draft.base === fingerprint(saved))) {
      return { value: /** @type {T} */ ({ ...saved, ...draft.data }), restored: true };
    }
    if (draft) clearDraft(userId, key);
    return { value: saved, restored: false };
  });
  const told = useRef(false);
  useEffect(() => {
    if (!start.restored || told.current) return;
    told.current = true;
    toast.show('draft.restored');
  }, [start.restored, toast]);
  return start.value;
}

/**
 * Keeps `current` as this screen's draft while it differs from `saved` (written half a second after
 * the last change, and when the screen closes), and deletes the draft once they match. Marks the
 * screen as having unsaved work for the idle warning. Returns `clear`, for after a successful save.
 * @template {Record<string, unknown>} T
 * @param {string} key
 * @param {T} saved
 * @param {T} current
 * @param {{ isNew?: boolean }} [options]
 * @returns {() => void}
 */
export function useDraftAutosave(key, saved, current, { isNew = false } = {}) {
  const auth = useAuth();
  const userId = auth.profile?.id;
  const base = isNew ? null : fingerprint(saved);
  const currentJson = JSON.stringify(current);
  const dirty = currentJson !== JSON.stringify(saved);
  useUnsavedWork(dirty);

  // What to write if the screen closes before the timer fires.
  const pending = useRef(/** @type {null | { userId: string, key: string, base: string | null, json: string }} */ (null));

  useEffect(() => {
    if (!userId) return undefined;
    if (!dirty) {
      pending.current = null;
      clearDraft(userId, key);
      return undefined;
    }
    pending.current = { userId, key, base, json: currentJson };
    const timer = setTimeout(() => {
      saveDraft(userId, key, base, JSON.parse(currentJson));
      pending.current = null;
    }, 500);
    return () => clearTimeout(timer);
  }, [userId, key, base, dirty, currentJson]);

  useEffect(
    () => () => {
      const p = pending.current;
      if (p) saveDraft(p.userId, p.key, p.base, JSON.parse(p.json));
    },
    [],
  );

  return useCallback(() => {
    pending.current = null;
    if (userId) clearDraft(userId, key);
  }, [userId, key]);
}
