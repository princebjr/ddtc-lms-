import { useState } from 'react';
import { Banner } from '@/components/ui/banner.jsx';
import { detectInAppBrowser } from '@/lib/in-app-browser.js';

const DISMISS_KEY = 'ddtc-in-app-notice-dismissed';

/** @returns {boolean} */
function wasDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "Open in Safari or Chrome" notice for in-app browsers (D27 item 8, D36, RESPONSIVE.md 15.6).
 * Never blocks the page; can be dismissed for this visit.
 * @param {{ userAgent?: string }} props  userAgent is injectable for tests
 */
export function InAppBrowserNotice({ userAgent }) {
  const app = detectInAppBrowser(userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent));
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (!app || dismissed) return null;
  return (
    <Banner
      tone="warning"
      dismissLabel="Dismiss notice"
      onDismiss={() => {
        try {
          window.sessionStorage.setItem(DISMISS_KEY, '1');
        } catch {
          // Storage unavailable: dismiss for this page view only.
        }
        setDismissed(true);
      }}
    >
      <p className="m-0">
        <strong className="font-semibold">Open this page in Safari or Chrome.</strong> You are in the {app} browser, where Google sign-in, downloads and
        the microphone may not work. Use the menu to open the page in your phone&apos;s browser.
      </p>
    </Banner>
  );
}
