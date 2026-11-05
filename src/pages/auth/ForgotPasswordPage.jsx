import { useState } from 'react';
import { Link } from 'react-router';
import { AuthLayout, FormMessage } from '@/components/auth/AuthLayout.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { Button } from '@/components/ui/button.jsx';
import { authErrorMessage, MESSAGES } from '@/lib/auth/messages.js';
import { appUrl } from '@/lib/auth/routing.js';
import { forgotPasswordSchema, validate } from '@/lib/auth/schemas.js';
import { getSupabase } from '@/lib/supabase.js';

// Forgot password (D32: recovery by email link; prototype screen "fp"). The answer is the same
// whether or not the address is registered (D22).

export default function ForgotPasswordPage() {
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {{ tone: 'error' | 'success', text: string } | null} */ (null));
  const [pending, setPending] = useState(false);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);
    const result = validate(forgotPasswordSchema, formValues(event.currentTarget));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(result.data.email, {
        redirectTo: appUrl('/auth/confirm?type=recovery'),
      });
      // Only rate limits and connection problems are reported; everything else looks like success.
      const shown = error ? authErrorMessage(error, 'recovery') : MESSAGES.checkInbox;
      setMessage({ tone: shown === MESSAGES.checkInbox ? 'success' : 'error', text: shown });
    } catch (error) {
      setMessage({ tone: 'error', text: authErrorMessage(error, 'recovery') });
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we will send a reset link."
      footer={
        <p className="m-0 text-center text-body-sm">
          <Link to="/login" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Email address" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.org" error={errors.email} />
        <FormMessage tone={message?.tone}>{message?.text}</FormMessage>
        <Button type="submit" size="auth" loading={pending} loadingLabel="Sending">
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}
