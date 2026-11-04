// Build-time feature flags (no runtime dependencies, so they stay out of the main bundle's way).

/** Preview-only routes (/dev/...) are compiled in for dev, CI and Vercel preview builds only. */
export const devRoutesEnabled = import.meta.env.VITE_DEV_ROUTES === 'true';
