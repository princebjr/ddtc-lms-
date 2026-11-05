import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthLayout, AuthSkeleton, FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { FormField, formValues } from '@/components/auth/FormField.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { authErrorMessage, MESSAGES } from '@/lib/auth/messages.js';
import { PASSWORD_MIN, resetPasswordSchema, validate } from '@/lib/auth/schemas.js';
import { getSupabase } from '@/lib/supabase.js';

// Choose a new password, reached from the recovery email through /auth/confirm, which signs the
// user in for this purpose. Without that session the page explains that the link is needed.

export default function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [message, setMessage] = useState(/** @type {string | null} */ (null));
  const [pending, setPending] = useState(false);

  if (auth.status === 'loading') return <AuthSkeleton fields={2} brand={false} />;
  if (auth.status !== 'signed-in') {
    return (
      <AuthLayout
        title="Open the link from your email"
        description={MESSAGES.linkInvalid}
        footer={
          <p className="m-0 text-center text-body-sm">
            <Link to="/forgot-password" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
              Send a new reset link
            </Link>
          </p>
        }
      >
        <p className="m-0 text-body-sm text-ink-secondary">For your security, a new password can only be chosen from the link we email you.</p>
      </AuthLayout>
    );
  }

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const onSubmit = async (event) => {
    event.preventDefault();
    setMessage(null);
    const result = validate(resetPasswordSchema, formValues(event.currentTarget));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password: result.data.password });
      if (error) {
        setMessage(authErrorMessage(error, 'reset'));
        return;
      }
      toast.show('account.password-changed');
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(authErrorMessage(error, 'reset'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout title="Choose a new password" description="Use a password you have not used for this account.">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Hidden username field so password managers save the new password for the right account. */}
        <input type="email" name="username" autoComplete="username" value={auth.profile?.email ?? ''} readOnly hidden />
        <FormField label="New password" name="password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters`} error={errors.password} />
        <FormField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" error={errors.confirmPassword} />
        <FormMessage>{message}</FormMessage>
        <Button type="submit" size="auth" loading={pending} loadingLabel="Saving">
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}
