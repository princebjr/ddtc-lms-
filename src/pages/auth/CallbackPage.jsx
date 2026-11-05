import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { AuthSkeleton } from '@/components/auth/AuthLayout.jsx';
import { useAuth } from '@/components/auth/AuthProvider.jsx';
import { callbackErrorMessage, MESSAGES } from '@/lib/auth/messages.js';

// /auth/callback: where Google sends the user back (D27). The Supabase client exchanges the code
// for a session on its own (detectSessionInUrl). An error in the URL (cancelled prompt, or the
// database refusing a staff or unverified account) returns to Sign In with a clear message.

const WAIT_MS = 10_000;

/** @returns {URLSearchParams} query and hash parameters together */
function callbackParams() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  for (const [k, v] of hash) if (!params.has(k)) params.set(k, v);
  return params;
}

export default function CallbackPage() {
  const auth = useAuth();
  const [error] = useState(() => callbackErrorMessage(callbackParams()));
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (error) return undefined;
    const timer = setTimeout(() => setTimedOut(true), WAIT_MS);
    return () => clearTimeout(timer);
  }, [error]);

  if (error) return <Navigate to="/login" replace state={{ message: error }} />;
  if (auth.status === 'signed-in') return <Navigate to="/" replace />;
  if (timedOut || (auth.status === 'signed-out' && !window.location.search.includes('code='))) {
    return <Navigate to="/login" replace state={{ message: MESSAGES.googleRefused }} />;
  }
  return <AuthSkeleton fields={0} brand={false} />;
}
