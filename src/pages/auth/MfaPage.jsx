import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthLayout, AuthSkeleton, FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { Button } from '@/components/ui/button.jsx';
import { authErrorMessage } from '@/lib/auth/messages.js';
import { otpSchema, validate } from '@/lib/auth/schemas.js';
import { getSupabase } from '@/lib/supabase.js';

// Two-step verification for administrators (D22, D32; prototype screen "mfa"). Every ADMIN policy
// needs an AAL2 session, so no admin page or data opens before this step. An administrator with no
// verified TOTP factor enrols one here (scan the QR code or type the key), then confirms a code.

/** @typedef {{ kind: 'loading' } | { kind: 'error' } | { kind: 'challenge', factorId: string }
 *   | { kind: 'enrol', factorId: string, qr: string, secret: string }} Step */

export default function MfaPage() {
  const auth = useAuth();
  const [step, setStep] = useState(/** @type {Step} */ ({ kind: 'loading' }));
  const [error, setError] = useState(/** @type {string | undefined} */ (undefined));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [pending, setPending] = useState(false);

  const prepare = useCallback(async () => {
    setStep({ kind: 'loading' });
    try {
      const mfa = getSupabase().auth.mfa;
      const { data, error: listError } = await mfa.listFactors();
      if (listError) throw listError;
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) {
        setStep({ kind: 'challenge', factorId: verified.id });
        return;
      }
      // Remove any half-finished enrolment, then start a new one.
      for (const factor of data.all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
        await mfa.unenroll({ factorId: factor.id });
      }
      const { data: enrolled, error: enrolError } = await mfa.enroll({ factorType: 'totp', friendlyName: 'DDTC LMS', issuer: 'DDTC LMS' });
      if (enrolError) throw enrolError;
      setStep({ kind: 'enrol', factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    } catch {
      setStep({ kind: 'error' });
    }
  }, []);

  // Run once on open (StrictMode would otherwise start two enrolments at the same time).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    prepare();
  }, [prepare]);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    if (step.kind !== 'challenge' && step.kind !== 'enrol') return;
    setMessage(null);
    const result = validate(otpSchema, formValues(event.currentTarget));
    if (!result.ok) {
      setError(result.errors.code);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const { error: verifyError } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: step.factorId, code: result.data.code });
      if (verifyError) {
        setMessage(authErrorMessage(verifyError, 'mfa'));
        return;
      }
      // The session is now AAL2; the guard sends the administrator on.
      await auth.refresh();
    } catch (err) {
      setMessage(authErrorMessage(err, 'mfa'));
    } finally {
      setPending(false);
    }
  };

  if (step.kind === 'loading') return <AuthSkeleton fields={1} brand={false} />;
  if (step.kind === 'error') {
    return (
      <AuthLayout title="Two-step verification">
        <ErrorState title="We could not start two-step verification" onRetry={prepare} />
      </AuthLayout>
    );
  }

  const enrolling = step.kind === 'enrol';
  return (
    <AuthLayout
      title={enrolling ? 'Set up two-step verification' : 'Two-step verification'}
      description={
        enrolling
          ? 'Administrators must use an authenticator app. Scan the code with Google Authenticator, Microsoft Authenticator or a similar app, then enter the 6-digit code it shows.'
          : 'Enter the 6-digit code from your authenticator app.'
      }
      footer={
        <p className="m-0 text-center text-body-sm">
          <button
            type="button"
            onClick={() => auth.signOut()}
            className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring"
          >
            Back to sign in
          </button>
        </p>
      }
    >
      {enrolling ? (
        <div className="flex flex-col items-center gap-3">
          <img src={step.qr} alt="QR code for your authenticator app" width="176" height="176" className="size-44 rounded-md bg-logo-white p-2" />
          <div className="flex w-full flex-col gap-1 text-center">
            <p className="m-0 text-body-sm text-ink-secondary">Cannot scan? Type this key into the app:</p>
            <code data-testid="totp-secret" className="text-label break-all text-ink select-all">
              {step.secret}
            </code>
          </div>
        </div>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Verification code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} error={error} />
        <FormMessage>{message}</FormMessage>
        <Button type="submit" size="auth" loading={pending} loadingLabel="Verifying">
          Verify
        </Button>
      </form>
    </AuthLayout>
  );
}
