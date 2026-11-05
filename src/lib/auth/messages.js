// User-facing messages for authentication errors (D22): messages never reveal whether an email
// address is registered. Supabase errors are mapped by their `code`, never shown raw.

export const MESSAGES = {
  invalidCredentials: 'The email or password is not correct.',
  emailNotConfirmed: 'Verify your email address before signing in. Check your inbox for the link.',
  // Sign-up and recovery always answer the same way, whether or not the address is registered.
  checkInbox: 'If the address can be used, an email is on its way. Check your inbox.',
  weakPassword: 'Choose a stronger password of at least 8 characters.',
  rateLimited: 'Too many attempts. Wait a minute and try again.',
  captcha: 'Complete the security check and try again.',
  network: 'You seem to be offline. Check your connection and try again.',
  signupFailed: 'We could not create the account. Check your details and try again.',
  linkInvalid: 'This link has expired or has already been used. Request a new one.',
  googleRefused:
    'Google sign-in could not be completed. Staff accounts sign in with email and password. If you already have a learner account, verify its email first, then try Google again.',
  googleCancelled: 'Google sign-in was cancelled. You can try again or use your email and password.',
  mfaWrongCode: 'That code is not correct or has expired. Enter the current code from your authenticator app.',
  generic: 'Something went wrong. Try again.',
};

/**
 * @param {unknown} error a Supabase AuthError, a fetch error, or anything else
 * @param {'sign-in' | 'sign-up' | 'recovery' | 'reset' | 'mfa' | 'profile'} context
 * @returns {string}
 */
export function authErrorMessage(error, context) {
  const e = /** @type {{ code?: string, status?: number, name?: string, message?: string } | null} */ (error);
  const code = e?.code ?? '';
  if (e?.name === 'AuthRetryableFetchError' || e?.name === 'TypeError' || e?.status === 0) return MESSAGES.network;
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || e?.status === 429) return MESSAGES.rateLimited;
  if (code === 'captcha_failed') return MESSAGES.captcha;
  if (code === 'weak_password') return MESSAGES.weakPassword;

  switch (context) {
    case 'sign-in':
      if (code === 'email_not_confirmed') return MESSAGES.emailNotConfirmed;
      // invalid_credentials, user_not_found and anything else: one message for all.
      return MESSAGES.invalidCredentials;
    case 'sign-up':
      // A duplicate address must look exactly like success (handled by the caller); the trigger's
      // missing-name rejection arrives as a 500 "Database error saving new user" (Phase 2, K12).
      if (code === 'user_already_exists' || code === 'email_exists') return MESSAGES.checkInbox;
      return MESSAGES.signupFailed;
    case 'recovery':
      return MESSAGES.checkInbox;
    case 'reset':
      if (code === 'same_password') return 'Choose a password you have not used for this account.';
      return MESSAGES.linkInvalid;
    case 'mfa':
      if (code === 'mfa_verification_failed' || code === 'mfa_challenge_expired') return MESSAGES.mfaWrongCode;
      return MESSAGES.generic;
    default:
      return MESSAGES.generic;
  }
}

/**
 * Message for an error returned to /auth/callback (Google) in the URL.
 * @param {URLSearchParams} params search and hash parameters merged
 * @returns {string | null} null when there is no error
 */
export function callbackErrorMessage(params) {
  const error = params.get('error');
  if (!error) return null;
  if (error === 'access_denied') return MESSAGES.googleCancelled;
  return MESSAGES.googleRefused;
}
