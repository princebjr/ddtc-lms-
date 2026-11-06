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

export default function LoginPage() {
  const auth = useAuth();
  const [search] = useSearchParams();
  const location = useLocation();
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(() => initialMessage(search, location.state));
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
