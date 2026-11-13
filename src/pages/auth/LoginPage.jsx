import { Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { AuthLayout, FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { GoogleSection } from '@/components/auth/GoogleSection.jsx';
import { Button } from '@/components/ui/button.jsx';
import { authErrorMessage } from '@/lib/auth/messages.js';
import { signInSchema, validate } from '@/lib/auth/schemas.js';
import { getSupabase } from '@/lib/supabase.js';

// Sign In (ARCHITECTURE.md section 5; prototype screen "in"). After a successful sign-in the
// route guard sends the user on (MFA for administrators, Complete your profile, or the dashboard).
// Suspended and deactivated accounts are signed out again and told why (D03).

export const BLOCKED_MESSAGES = {
  suspended: 'Your account is suspended. Contact the DDTC office if you think this is a mistake.',
  deactivated: 'This account has been deactivated. Contact the DDTC office for help.',
};
export const EXPIRED_MESSAGE = 'Your session ended. Sign in again to continue.';

/**
 * Why the user is here after an idle sign-out (D43): `?idle=<minutes>`.
 * @param {number} minutes
 */
export function idleMessage(minutes) {
  return `You were signed out after ${minutes} minutes of inactivity.`;
}

/** @param {URLSearchParams} search @returns {string | null} */
function idleNotice(search) {
  const idle = search.get('idle');
  return idle && /^[1-9]\d?$/.test(idle) ? idleMessage(Number(idle)) : null;
}

export default function LoginPage() {
  const auth = useAuth();
  const [search] = useSearchParams();
  const location = useLocation();
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(() => initialMessage(search, location.state));
  const [notice, setNotice] = useState(() => idleNotice(search));
  const [pending, setPending] = useState(false);

  // A blocked account that has just signed in is signed out again with the reason.
  const blockedStatus = auth.status === 'signed-in' ? auth.profile?.account_status : undefined;
  const { signOut } = auth;
  useEffect(() => {
    if (blockedStatus === 'SUSPENDED' || blockedStatus === 'DEACTIVATED') {
      const text = BLOCKED_MESSAGES[blockedStatus === 'SUSPENDED' ? 'suspended' : 'deactivated'];
      signOut().then(() => setMessage(text));
    }
  }, [blockedStatus, signOut]);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);
    setNotice(null);
    const result = validate(signInSchema, formValues(event.currentTarget));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      });
      if (error) setMessage(authErrorMessage(error, 'sign-in'));
    } catch (error) {
      setMessage(authErrorMessage(error, 'sign-in'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to your DDTC LMS account"
      brand
      glow
      footer={
        <p className="m-0 text-center text-body-sm text-ink-secondary">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
            Sign up
          </Link>
        </p>
      }
    >
      {/* Owner request 2026-11-13 (Phase 15, ADR-027): the inactivity sign-out notice as an info alert: a soft card
          tinted with the primary colour, large rounded corners and the overlay shadow, a round filled badge with an
          info icon, a bold title with the reason beneath, and a close button. Still a status, not an error. */}
      {notice ? (
        <div role="status" data-slot="signed-out-notice" className="flex items-center gap-3 rounded-lg status-tint-primary py-3 pr-1 pl-3 shadow-overlay">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden="true">
            <Info className="size-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="m-0 text-body-sm font-semibold text-ink">You have been signed out</p>
            <p className="m-0 text-body-sm text-ink-secondary">{notice}</p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-describedby={message ? 'login-message' : undefined}>
        <FormField label="Email address" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.org" error={errors.email} />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          error={errors.password}
          labelAction={
            <Link to="/forgot-password" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
              Forgot password?
            </Link>
          }
        />
        <div id="login-message">
          <FormMessage>{message}</FormMessage>
        </div>
        <Button type="submit" size="auth" loading={pending} loadingLabel="Signing in">
          Sign In
        </Button>
      </form>
      <GoogleSection />
    </AuthLayout>
  );
}

/**
 * @param {URLSearchParams} search
 * @param {unknown} state
 * @returns {string | null}
 */
function initialMessage(search, state) {
  const blocked = search.get('blocked');
  if (blocked === 'suspended' || blocked === 'deactivated') return BLOCKED_MESSAGES[blocked];
  if (search.get('expired') === '1') return EXPIRED_MESSAGE;
  const fromState = /** @type {{ message?: unknown } | null} */ (state)?.message;
  return typeof fromState === 'string' ? fromState : null;
}
