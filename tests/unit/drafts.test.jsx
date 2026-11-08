// @vitest-environment jsdom
// D43 (ADR-011): unsaved work is kept on this device as a draft per user and screen for 24 hours, put
// back with "Draft restored" when the same user opens the same screen again (as after an idle
// sign-out), and deleted by a deliberate sign-out. A draft only goes back over the saved version it
// was made from (a co-lecturer's newer save is never overwritten); a new item's draft always does.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContextForTests } from '@/components/auth/AuthProvider.jsx';
import { useDraftAutosave, useDraftStart } from '@/hooks/use-draft.js';
import { hasUnsavedWork } from '@/lib/auth/activity.js';
import { clearDraft, clearUserDrafts, DRAFT_TTL_MS, fingerprint, loadDraft, purgeExpiredDrafts, resumeDrafts, saveDraft, stopDrafts } from '@/lib/drafts.js';

const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@/components/feedback/ToastProvider.jsx', () => ({ useToast: () => toast }));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({}) }));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-07T10:00:00Z') });
  localStorage.clear();
  resumeDrafts();
  toast.show.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the draft store', () => {
  it('keeps one draft per user and screen for 24 hours', () => {
    saveDraft('u1', 'lesson:c1:l1', 'b1', { title: 'Grace' });
    saveDraft('u2', 'lesson:c1:l1', 'b1', { title: 'Other user' });
    expect(loadDraft('u1', 'lesson:c1:l1')).toMatchObject({ base: 'b1', data: { title: 'Grace' } });
    expect(loadDraft('u1', 'lesson:c1:l2')).toBeNull();
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS + 1);
    expect(loadDraft('u1', 'lesson:c1:l1')).toBeNull();
    expect(localStorage.getItem('ddtc:draft:u1:lesson:c1:l1')).toBeNull();
  });

  it("a deliberate sign-out deletes only that user's drafts, and nothing is written for them until they sign in again", () => {
    saveDraft('u1', 'a', null, { x: 1 });
    saveDraft('u1', 'b', null, { x: 2 });
    saveDraft('u2', 'a', null, { x: 3 });
    stopDrafts('u1');
    expect(loadDraft('u1', 'a')).toBeNull();
    expect(loadDraft('u1', 'b')).toBeNull();
    expect(loadDraft('u2', 'a')).not.toBeNull();
    saveDraft('u1', 'a', null, { x: 4 }); // a screen closing after the sign-out
    expect(loadDraft('u1', 'a')).toBeNull();
    resumeDrafts();
    saveDraft('u1', 'a', null, { x: 5 });
    expect(loadDraft('u1', 'a')?.data).toEqual({ x: 5 });
  });

  it('clears single drafts, all of a user, and any older than 24 hours', () => {
    saveDraft('u1', 'a', null, {});
    clearDraft('u1', 'a');
    expect(loadDraft('u1', 'a')).toBeNull();
    saveDraft('u1', 'a', null, {});
    saveDraft('u1', 'b', null, {});
    clearUserDrafts('u1');
    expect(Object.keys(localStorage).filter((k) => k.startsWith('ddtc:draft:u1:'))).toEqual([]);
    saveDraft('u2', 'old', null, {});
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS + 1);
    saveDraft('u2', 'new', null, {});
    purgeExpiredDrafts();
    expect(Object.keys(localStorage).sort()).toEqual(['ddtc:draft:u2:new']);
  });

  it('fingerprints saved values', () => {
    expect(fingerprint({ title: 'A', content: '<p>x</p>' })).toBe(fingerprint({ title: 'A', content: '<p>x</p>' }));
    expect(fingerprint({ title: 'A', content: '<p>x</p>' })).not.toBe(fingerprint({ title: 'B', content: '<p>x</p>' }));
  });
});

/**
 * A minimal editor with a draft, as the lesson and assignment editors use it.
 * @param {{ saved: { title: string }, isNew?: boolean }} props
 */
function Editor({ saved, isNew = false }) {
  const start = useDraftStart('lesson:c1:l1', saved, { isNew });
  const [title, setTitle] = useState(start.title);
  const [savedNow, setSavedNow] = useState(saved);
  const clear = useDraftAutosave('lesson:c1:l1', savedNow, { title }, { isNew });
  return (
    <>
      <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button
        type="button"
        onClick={() => {
          clear();
          setSavedNow({ title });
        }}
      >
        Save
      </button>
    </>
  );
}

const EMPTY = { title: '' };

/**
 * A new item's editor, as in the lesson and assignment editors: Save clears the draft and the screen
 * then moves to the saved item, so until it closes its values still differ from the empty saved ones.
 */
function NewItemEditor() {
  const start = useDraftStart('lesson:c1:new', EMPTY, { isNew: true });
  const [title, setTitle] = useState(start.title);
  const clear = useDraftAutosave('lesson:c1:new', EMPTY, { title }, { isNew: true });
  return (
    <>
      <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="button" onClick={clear}>
        Save
      </button>
    </>
  );
}

/** @param {import('react').ReactNode} ui */
function signedIn(ui) {
  return render(<AuthContextForTests.Provider value={/** @type {any} */ ({ status: 'signed-in', profile: { id: 'u1', role: 'LECTURER' } })}>{ui}</AuthContextForTests.Provider>);
}

describe('editor drafts', () => {
  it('keep unsaved changes half a second after the last edit, mark unsaved work, and go once saved or undone', () => {
    const view = signedIn(<Editor saved={{ title: 'Grace' }} />);
    expect(hasUnsavedWork()).toBe(false);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Grace and faith' } });
    expect(hasUnsavedWork()).toBe(true);
    expect(loadDraft('u1', 'lesson:c1:l1')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(loadDraft('u1', 'lesson:c1:l1')).toMatchObject({ base: fingerprint({ title: 'Grace' }), data: { title: 'Grace and faith' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Grace' } });
    expect(loadDraft('u1', 'lesson:c1:l1')).toBeNull();
    expect(hasUnsavedWork()).toBe(false);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Faith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft('u1', 'lesson:c1:l1')).toBeNull();
    expect(hasUnsavedWork()).toBe(false);
    view.unmount();
  });

  // Found by CI (lessons.spec.js): a lesson saved within half a second of the last key press got its
  // draft back from the waiting write, so the next new lesson opened with the old text in it.
  it("a save deletes the draft for good, even with the half-second write still waiting, until the next change", () => {
    const view = signedIn(<NewItemEditor />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The early church' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(loadDraft('u1', 'lesson:c1:new')).toBeNull();
    expect(hasUnsavedWork()).toBe(false);
    // A change after the save is unsaved work again, and kept.
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'The early church, part 2' } });
    expect(hasUnsavedWork()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(loadDraft('u1', 'lesson:c1:new')?.data).toEqual({ title: 'The early church, part 2' });
    // Saved again, then the screen moves to the saved item: nothing is written on the way out.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    view.unmount();
    expect(loadDraft('u1', 'lesson:c1:new')).toBeNull();
    signedIn(<NewItemEditor />);
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('write the draft when the screen closes before the timer (an idle sign-out)', () => {
    const view = signedIn(<Editor saved={{ title: 'Grace' }} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Grace and peace' } });
    view.unmount();
    expect(loadDraft('u1', 'lesson:c1:l1')?.data).toEqual({ title: 'Grace and peace' });
  });

  it('put a draft back over the version it was made from, with "Draft restored"', () => {
    saveDraft('u1', 'lesson:c1:l1', fingerprint({ title: 'Grace' }), { title: 'Grace and peace' });
    signedIn(<Editor saved={{ title: 'Grace' }} />);
    expect(screen.getByLabelText('Title')).toHaveValue('Grace and peace');
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('draft.restored');
  });

  it("drop a draft made from an older version (someone saved since), so their work is not overwritten", () => {
    saveDraft('u1', 'lesson:c1:l1', fingerprint({ title: 'Grace' }), { title: 'Grace and peace' });
    signedIn(<Editor saved={{ title: 'Grace, revised by a co-lecturer' }} />);
    expect(screen.getByLabelText('Title')).toHaveValue('Grace, revised by a co-lecturer');
    expect(toast.show).not.toHaveBeenCalled();
    expect(loadDraft('u1', 'lesson:c1:l1')).toBeNull();
  });

  it("always put back a new item's draft", () => {
    saveDraft('u1', 'lesson:c1:l1', null, { title: 'A new lesson' });
    signedIn(<Editor saved={{ title: '' }} isNew />);
    expect(screen.getByLabelText('Title')).toHaveValue('A new lesson');
    expect(toast.show).toHaveBeenCalledWith('draft.restored');
  });

  it("never put back another user's draft", () => {
    saveDraft('u2', 'lesson:c1:l1', fingerprint({ title: 'Grace' }), { title: 'Not yours' });
    signedIn(<Editor saved={{ title: 'Grace' }} />);
    expect(screen.getByLabelText('Title')).toHaveValue('Grace');
    expect(toast.show).not.toHaveBeenCalled();
  });
});
