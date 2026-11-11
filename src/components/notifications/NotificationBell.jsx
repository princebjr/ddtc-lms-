import { Bell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { fetchNotifications, fetchUnreadCount, NOTICES_CHANGED } from '@/lib/notifications/notifications.js';

// The header bell (Phase 11, D21): the unread count on every device, checked on load, every minute and
// when the app comes back into view. When the count goes up, "New notification arrives" (UI_FEEDBACK:
// the notification's title, with Open). Grade notices are announced by GradeNotices, so not twice.

const CHECK_EVERY_MS = 60_000;

/** @param {{ href: string }} props */
export function NotificationBell({ href }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const last = useRef(/** @type {number | null} */ (null));

  const check = useCallback(async () => {
    try {
      const n = await fetchUnreadCount();
      const before = last.current;
      last.current = n;
      setCount(n);
      if (before !== null && n > before) {
        const [newest] = await fetchNotifications();
        if (newest && !newest.read_at && !newest.notification_type.startsWith('GRADE_')) {
          toast.show('notification.new', { params: { title: newest.title }, onAction: () => navigate(newest.link_path ?? href) });
        }
      }
    } catch {
      // A failed check is not worth an error: the next one tries again.
    }
  }, [toast, navigate, href]);

  useEffect(() => {
    const first = setTimeout(() => void check(), 0);
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTICES_CHANGED, check);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTICES_CHANGED, check);
    };
  }, [check]);

  return (
    <Link
      to={href}
      data-testid="notification-bell"
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-fill focus-visible:focus-ring"
    >
      <Bell className="size-5" aria-hidden="true" />
      {count ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1 text-caption font-semibold text-on-error"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
