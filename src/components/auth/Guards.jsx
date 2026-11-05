import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { DashboardSkeleton } from '@/components/feedback/Skeletons.jsx';
import { ErrorState } from '@/components/feedback/States.jsx';
import { decideProtected, decideSignedOutOnly, decideStep } from '@/lib/auth/access.js';
import { AuthSkeleton } from './AuthLayout.jsx';
import { useAuth } from './AuthProvider.jsx';

// Route guards (ARCHITECTURE.md section 5). They decide only what the screen shows: while the
// session is checked a skeleton is shown, so a signed-in user never sees Sign In flash and a
// signed-out visitor never sees protected content. The database is the real protection.

/** @typedef {import('@/lib/auth/routing.js').Role} Role */

/**
 * Signs a blocked account out and sends it to Sign In, which explains why.
 * @param {{ status: 'SUSPENDED' | 'DEACTIVATED' }} props
 */
function Blocked({ status }) {
  const { signOut } = useAuth();
  useEffect(() => {
    signOut({ to: `/login?blocked=${status.toLowerCase()}` });
  }, [signOut, status]);
  return <Navigate to={`/login?blocked=${status.toLowerCase()}`} replace />;
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh-screen bg-page px-4 pt-safe pb-safe sm:px-6" aria-busy="true">
      <span className="sr-only" role="status">
        Checking your session
      </span>
      <div className="mx-auto max-w-content pt-6">
        <DashboardSkeleton />
      </div>
    </div>
  );
}

function SessionError() {
  const { refresh } = useAuth();
  return (
    <main id="main" className="flex min-h-dvh-screen items-center justify-center bg-page px-4">
      <ErrorState title="We could not check your session" onRetry={() => refresh()} />
    </main>
  );
}

/** @param {{ decision: import('@/lib/auth/access.js').AccessDecision, skeleton: import('react').ReactNode }} props */
function Apply({ decision, skeleton }) {
  switch (decision.kind) {
    case 'loading':
      return skeleton;
    case 'error':
      return <SessionError />;
    case 'redirect':
      return <Navigate to={decision.to} replace />;
    case 'blocked':
      return <Blocked status={decision.status} />;
    default:
      return <Outlet />;
  }
}

/** Routes under /admin, /lecturer or /learner. @param {{ role: Role }} props */
export function ProtectedRoute({ role }) {
  const auth = useAuth();
  const location = useLocation();
  const decision = decideProtected({ ...auth, role, path: location.pathname + location.search });
  return <Apply decision={decision} skeleton={<ShellSkeleton />} />;
}

/** Sign In, Sign Up, Forgot password. */
export function SignedOutRoute() {
  const auth = useAuth();
  const location = useLocation();
  const [search] = useSearchParams();
  const decision = decideSignedOutOnly({ ...auth, path: location.pathname, next: search.get('next') });
  return <Apply decision={decision} skeleton={<AuthSkeleton />} />;
}

/** /mfa and /complete-profile. @param {{ step: 'mfa' | 'complete-profile' }} props */
export function StepRoute({ step }) {
  const auth = useAuth();
  const [search] = useSearchParams();
  const decision = decideStep({ ...auth, path: '', step, next: search.get('next') });
  return <Apply decision={decision} skeleton={<AuthSkeleton fields={step === 'mfa' ? 1 : 2} brand={false} />} />;
}

/** `/`: Sign In when signed out, the dashboard when signed in. */
export function RootRedirect() {
  const auth = useAuth();
  const decision = decideSignedOutOnly({ ...auth, path: '/', next: null });
  // A signed-out visitor (or a blocked account, which Sign In signs out) goes to Sign In.
  if (decision.kind === 'allow') return <Navigate to="/login" replace />;
  return <Apply decision={decision} skeleton={<AuthSkeleton />} />;
}
