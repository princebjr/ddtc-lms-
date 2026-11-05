import { detectInAppBrowser } from '@/lib/in-app-browser.js';
import { appUrl } from '@/lib/auth/routing.js';
import { getSupabase } from '@/lib/supabase.js';

// Continue with Google (D27). Scopes are `openid email profile` only. Google blocks sign-in inside
// embedded in-app browsers, so there the button explains how to open the page in Safari or Chrome
// instead of starting a sign-in that would fail (D27 item 8).

export const GOOGLE_SCOPES = 'openid email profile';

/** @returns {{ blocked: true, app: string } | { blocked: false }} */
export function googleAvailability() {
  const app = detectInAppBrowser(window.navigator.userAgent);
  return app ? { blocked: true, app } : { blocked: false };
}

/** Starts the Google redirect. Errors come back to /auth/callback in the URL. */
export async function startGoogleSignIn() {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: appUrl('/auth/callback'),
      scopes: GOOGLE_SCOPES,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}
