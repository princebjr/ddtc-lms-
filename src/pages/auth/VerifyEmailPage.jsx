import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { AuthLayout, FormMessage } from '@/components/auth/AuthLayout.jsx';
import { useToast } from '@/components/feedback/ToastProvider.jsx';
import { Button } from '@/components/ui/button.jsx';
import { authErrorMessage } from '@/lib/auth/messages.js';
import { appUrl } from '@/lib/auth/routing.js';
import { getSupabase } from '@/lib/supabase.js';

// "Check your email" after sign-up (prototype screen "ver"). The account cannot sign in until the
// link is opened (D22). Resending answers the same way for any address.

export default function VerifyEmailPage() {
  const location = useLocation();
  const toast = useToast();
  const email = /** @type {{ email?: string } | null} */ (location.state)?.email ?? '';
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  const resend = async () => {
    if (!email) return;
    setPending(true);
    setMessage(null);
    try {
      const { error } = await getSupabase().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: appUrl('/auth/confirm?type=signup') },
      });
      if (error && error.status === 429) setMessage(authErrorMessage(error, 'recovery'));
      else toast.show('account.verification-resent');
    } catch (error) {
      setMessage(authErrorMessage(error, 'recovery'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout
      title="Check your email"
      description={
        email ? (
          <>
            We sent a verification link to <span className="font-semibold text-ink">{email}</span>. You must verify before signing in.
          </>
        ) : (
          'We sent you a verification link. You must verify before signing in.'
        )
      }
      footer={
        <p className="m-0 text-center text-body-sm">
          <Link to="/login" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
            Back to sign in
          </Link>
        </p>
      }
    >
      <div className="flex items-start gap-3 rounded-md bg-fill p-4 text-body-sm text-ink-secondary">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-link" aria-hidden="true" />
        <p className="m-0">Open the email on any device and select Verify email. The link expires in 1 hour. Check your spam folder if it has not arrived.</p>
      </div>
      {email ? (
        <div className="flex flex-col gap-4">
          <FormMessage>{message}</FormMessage>
          <Button type="button" variant="secondary" size="auth" onClick={resend} loading={pending} loadingLabel="Sending">
            Resend verification email
          </Button>
        </div>
      ) : null}
    </AuthLayout>
  );
}
