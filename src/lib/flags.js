// Build-time feature flags (no runtime dependencies, so they stay out of the main bundle's way).

/** Preview-only routes (/dev/...) are compiled in for dev, CI and Vercel preview builds only. */
export const devRoutesEnabled = import.meta.env.VITE_DEV_ROUTES === 'true';

/**
 * Continue with Google on Sign In and Sign Up (D27). On unless the build sets VITE_GOOGLE_SIGN_IN=false: production
 * launches with email and password only until DDTC's Google OAuth setup is ready (owner, 2026-11-14, Phase 14).
 */
export const googleSignInEnabled = import.meta.env.VITE_GOOGLE_SIGN_IN !== 'false';
