import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { fetchUnreadGradeNotifications } from '@/lib/grading/grading.js';

// "New grade available" (Phase 9; UI_FEEDBACK.md, Learner; owner decision 1): on the learner's next
// page load after a grade is released or updated, one toast with View, which opens the assignment.
// Each notification is announced once per browser tab; it counts as read when the learner opens the
// assignment and sees the grade (the notification centre arrives in Phase 11).

const SEEN_KEY = 'ddtc:grade-notices-seen';

/** @returns {Set<string>} */
function seen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

/** @param {Set<string>} ids */
function remember(ids) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    // Private mode or storage blocked: the toast may show again on the next page; nothing breaks.
  }
}

export function GradeNotices() {
  const toast = useToast();
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    fetchUnreadGradeNotifications()
      .then((notes) => {
        if (cancelled) return;
        const already = seen();
        const fresh = notes.filter((n) => !already.has(n.id));
        if (!fresh.length) return;
        for (const n of fresh) already.add(n.id);
        remember(already);
        const newest = fresh[0];
        toast.show('learner.grade-released', { onAction: () => navigate(newest.link_path ?? '/learner/assignments') });
      })
      // A failed check is not worth an error: the grade is on the assignment page either way.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [toast, navigate]);
  return null;
}
