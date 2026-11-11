import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { countdownAnnouncement, formatCountdown, formatSpan } from '@/lib/auth/idle.js';

// The idle warning (D43, ADR-011; UI_FEEDBACK "Idle sign-out"). An alert dialog: focus starts on
// Continue Session and is trapped, Escape equals Continue Session, a tap outside does nothing. It
// says how long the user has been away, counts down (screen readers hear it at whole minutes and at
// 30 and 10 seconds), and says when there are unsaved changes.

/**
 * @param {{ open: boolean, endsAt: number, timeoutMs: number, warningMs: number, unsaved: boolean,
 *   onContinue: () => void, onSignOut: () => void }} props
 */
export function IdleWarningDialog({ open, endsAt, timeoutMs, warningMs, unsaved, onContinue, onSignOut }) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onContinue();
      }}
    >
      {/* Owner requests 2026-11-11: a red border (error colour) marks the security warning, in both themes; it sits in the
          centre of the screen on every size (not a bottom sheet on phones) over a stronger dim. */}
      <AlertDialogContent
        data-slot="idle-warning"
        overlayClassName="bg-scrim-strong"
        className="inset-x-4 top-1/2 bottom-auto -translate-y-1/2 rounded-lg border-2 border-error pb-4 sm:border-2"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Your session ends in {formatSpan(warningMs)}</AlertDialogTitle>
          <AlertDialogDescription>
            You have not used DDTC LMS for {formatSpan(timeoutMs - warningMs)}. Choose Continue Session to keep working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {unsaved ? (
          <p className="m-0 rounded-md bg-fill p-3 text-body-sm text-ink">
            You have unsaved changes. If you are signed out, they are kept on this device as a draft for 24 hours.
          </p>
        ) : null}
        <Countdown endsAt={endsAt} />
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button>Continue Session</Button>
          </AlertDialogCancel>
          <Button variant="outline" onClick={onSignOut}>
            Sign out now
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Mounted each time the dialog opens, so it starts from the right time.
 * @param {{ endsAt: number }} props
 */
function Countdown({ endsAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, endsAt - now);
  return (
    <>
      <p className="m-0 text-body-sm text-ink-secondary" aria-hidden="true" data-testid="idle-countdown">
        Signing out in <span className="text-label tabular-nums text-ink">{formatCountdown(remaining)}</span>
      </p>
      <p className="sr-only" aria-live="polite">
        {countdownAnnouncement(remaining)}
      </p>
    </>
  );
}
