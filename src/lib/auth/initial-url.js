// The address the app was opened with, recorded before the Supabase client starts. The client
// exchanges an email link's one-time `code` on start-up and then removes it from the address bar,
// which can happen before the lazily loaded /auth/confirm page renders. That page reads the
// original address from here. Imported first in main.jsx.

export const INITIAL_URL = typeof window === 'undefined' ? '' : window.location.href;
