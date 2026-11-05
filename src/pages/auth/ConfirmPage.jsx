import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { AuthLayout, AuthSkeleton } from '@/components/auth/AuthLayout.jsx';
import { MESSAGES } from '@/lib/auth/messages.js';
import { getSupabase } from '@/lib/supabase.js';

// /auth/confirm: the target of every email link (supabase/templates). It verifies the token hash
// itself, so the link works on any device, not only the browser that started the flow.
// signup -> signed in, then the guards route on; recovery -> choose a new password.

const TYPES = /** @type {const} */ (['signup', 'recovery', 'email_change']);

export default function ConfirmPage() {
  const [search] = useSearchParams();
  const tokenHash = search.get('token_hash');
  const type = TYPES.find((t) => t === search.get('type'));
  const [state, setState] = useState(/** @type {'working' | 'done' | 'failed'} */ (tokenHash && type ? 'working' : 'failed'));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!tokenHash || !type) return;
    getSupabase()
      .auth.verifyOtp({ token_hash: tokenHash, type })
      .then(({ error }) => setState(error ? 'failed' : 'done'))
      .catch(() => setState('failed'));
  }, [tokenHash, type]);

  if (state === 'working') return <AuthSkeleton fields={0} brand={false} />;
  if (state === 'done') return <Navigate to={type === 'recovery' ? '/reset-password' : '/'} replace />;
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
      <p className="m-0 text-body-sm text-ink-secondary">If you were verifying a new account, sign in: we will offer to send a new link.</p>
    </AuthLayout>
  );
}
