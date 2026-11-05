import { useState } from 'react';
import { GoogleButton } from '@/components/brand/GoogleButton.jsx';
import { authErrorMessage } from '@/lib/auth/messages.js';
import { googleAvailability, startGoogleSignIn } from '@/pages/auth/google.js';
import { FormMessage, OrDivider } from './AuthLayout.jsx';

// The "or" divider and Continue with Google, below the main button on Sign In and Sign Up (D27).
// Learners only: the database refuses a Google sign-in for staff (Phase 3 migration 8).

/** @param {string} app */
export const IN_APP_GOOGLE_MESSAGE = (app) =>
  `Google sign-in does not work inside ${app}. Open this page in Safari or Chrome, or use your email and password.`;

export function GoogleSection() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(/** @type {string | null} */ (null));

  const onClick = async () => {
    setMessage(null);
    const availability = googleAvailability();
    if (availability.blocked) {
      setMessage(IN_APP_GOOGLE_MESSAGE(availability.app));
      return;
    }
    setLoading(true);
    try {
      await startGoogleSignIn();
    } catch (error) {
      setLoading(false);
      setMessage(authErrorMessage(error, 'sign-in'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <OrDivider />
      <GoogleButton onClick={onClick} loading={loading} />
      <FormMessage>{message}</FormMessage>
    </div>
  );
}
