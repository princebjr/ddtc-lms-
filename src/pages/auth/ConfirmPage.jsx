import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { AuthLayout, AuthSkeleton } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { MESSAGES } from '@/lib/auth/messages.js';
import { INITIAL_URL } from '@/lib/auth/initial-url.js';
import { getSupabase } from '@/lib/supabase.js';

// /auth/confirm: where every email link lands (sign-up verification, password recovery, email
// change). The app's own requests add `?type=signup` or `?type=recovery`. Two kinds of link exist:
//
// 1. Branded templates (supabase/templates, need a custom SMTP sender): `token_hash` is verified
//    here, so the link works on any device.
// 2. Supabase's default emails (free plan without SMTP, used for now): Supabase verifies the link,
//    then returns here with a one-time PKCE `code`. The Supabase client exchanges it on load, which
//    works in the browser that started the flow. Opened on another device, the exchange fails; a
//    sign-up is still verified by then, so the user is asked to sign in.
//
// The parameters come from the address the app was opened with (initial-url.js), because the
// client removes `code` from the address bar on start-up, possibly before this page loads.

const TYPES = /** @type {const} */ (['signup', 'recovery', 'email_change']);

/** @returns {{ tokenHash: string | null, code: string | null, type: typeof TYPES[number] | undefined, error: string | null }} */
function readLink() {
  // Prefer the address the app was opened with: the client may already have removed `code`.
  const opened = new URL(INITIAL_URL || window.location.href);
  const source = opened.pathname === window.location.pathname ? opened : new URL(window.location.href);
  const search = source.searchParams;
  const hash = new URLSearchParams(source.hash.replace(/^#/, ''));
  const rawType = search.get('type');
  return {
    tokenHash: search.get('token_hash'),
    code: search.get('code'),
    type: TYPES.find((t) => t === rawType),
    error: search.get('error') ?? hash.get('error'),
  };
}

export default function ConfirmPage() {
  const auth = useAuth();
  const [link] = useState(readLink);
  const [otpState, setOtpState] = useState(/** @type {'working' | 'done' | 'failed'} */ (link.tokenHash && link.type ? 'working' : 'failed'));
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !link.tokenHash || !link.type) return;
    started.current = true;
    getSupabase()
      .auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
      .then(({ error }) => setOtpState(error ? 'failed' : 'done'))
      .catch(() => setOtpState('failed'));
  }, [link]);

  const next = link.type === 'recovery' ? '/reset-password' : '/';

  /** @type {'working' | 'done' | 'verified-elsewhere' | 'failed'} */
  let state;
  if (link.error) state = 'failed';
  else if (link.tokenHash) state = otpState;
  else if (link.code) {
    if (auth.status === 'loading') state = 'working';
    else if (auth.status === 'signed-in') state = 'done';
    else state = link.type === 'signup' ? 'verified-elsewhere' : 'failed';
  } else state = 'failed';

  if (state === 'working') return <AuthSkeleton fields={0} brand={false} />;
  if (state === 'done') return <Navigate to={next} replace />;
  if (state === 'verified-elsewhere') {
    return (
      <AuthLayout
        title="Your email is verified"
        description="Sign in with your email and password to continue."
        footer={
          <p className="m-0 text-center text-body-sm">
            <Link to="/login" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
              Go to sign in
            </Link>
          </p>
        }
      >
        <p className="m-0 text-body-sm text-ink-secondary">You opened the link on a different device or browser from the one you signed up on, so you need to sign in here once.</p>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="This link cannot be used"
      description={MESSAGES.linkInvalid}
      footer={
        <div className="flex flex-col items-center gap-1 text-body-sm">
          <Link to="/forgot-password" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
            Reset your password
          </Link>
          <Link to="/login" className="inline-flex min-h-11 items-center px-1 text-label text-link hover:underline focus-visible:focus-ring">
            Back to sign in
          </Link>
        </div>
      }
    >
      <p className="m-0 text-body-sm text-ink-secondary">
        If you were verifying a new account, sign in: we will offer to send a new link. A password reset link works only in the browser where you asked for it.
      </p>
    </AuthLayout>
  );
}
