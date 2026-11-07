import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase.js';

// The single source of truth for who is signed in (ARCHITECTURE.md section 5, sign-in steps 1 to 5).
// The role and account status come only from the user's own `profiles` row (RLS), never from the
// token or client data. Route guards use this to decide what the screen shows; the database is the
// real protection.

/** @typedef {import('@supabase/supabase-js').Session} Session */
/** @typedef {import('@/lib/database.types').Database['public']['Tables']['profiles']['Row']} ProfileRow */
/** @typedef {Pick<ProfileRow, 'id' | 'id_number' | 'first_name' | 'second_name' | 'email' | 'contact_number' | 'role' | 'account_status' | 'profile_completed' | 'profile_image_file_id' | 'can_create_courses' | 'can_publish_directly' | 'branch_id'>} Profile */

/**
 * @typedef {object} AuthState
 * @property {'loading' | 'signed-out' | 'signed-in' | 'error'} status
 * @property {Session | null} session
 * @property {Profile | null} profile
 * @property {'aal1' | 'aal2' | null} aal      assurance level of the current session
 * @property {'aal1' | 'aal2' | null} nextAal  the level the user can reach (aal2 when a TOTP factor is verified)
 * @property {boolean} configured             false when the Supabase settings are missing
 * @property {string | null} signedOutTo      where a deliberate sign-out lands (no "next" page is remembered)
 */

/**
 * @typedef {AuthState & {
 *   refresh: () => Promise<void>,
 *   signOut: (options?: { to?: string }) => Promise<void>,
 * }} AuthContextValue
 */

const PROFILE_COLUMNS = 'id, id_number, first_name, second_name, email, contact_number, role, account_status, profile_completed, profile_image_file_id, can_create_courses, can_publish_directly, branch_id';

/** @type {import('react').Context<AuthContextValue | null>} */
const AuthContext = createContext(/** @type {AuthContextValue | null} */ (null));

/** @returns {import('@/lib/supabase.js').AppSupabaseClient | null} */
function clientOrNull() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

/**
 * @param {import('@/lib/supabase.js').AppSupabaseClient} supabase
 * @param {Session} session
 * @returns {Promise<Pick<AuthState, 'profile' | 'aal' | 'nextAal'>>}
 */
async function loadAccount(supabase, session) {
  const [{ data: profile, error }, { data: level }] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', session.user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (error) throw error;
  return {
    profile: profile ?? null,
    aal: /** @type {'aal1' | 'aal2' | null} */ (level?.currentLevel ?? null),
    nextAal: /** @type {'aal1' | 'aal2' | null} */ (level?.nextLevel ?? null),
  };
}

/** @param {{ children: import('react').ReactNode }} props */
export function AuthProvider({ children }) {
  const [supabase] = useState(clientOrNull);
  /** @type {[AuthState, import('react').Dispatch<import('react').SetStateAction<AuthState>>]} */
  const [state, setState] = useState(() => /** @type {AuthState} */ ({
    status: supabase ? 'loading' : 'signed-out',
    session: null,
    profile: null,
    aal: null,
    nextAal: null,
    configured: Boolean(supabase),
    signedOutTo: null,
  }));
  const loadSeq = useRef(0);

  const applySession = useCallback(
    /** @param {Session | null} session */
    async (session) => {
      const seq = ++loadSeq.current;
      if (!supabase || !session) {
        setState((s) => ({ ...s, status: 'signed-out', session: null, profile: null, aal: null, nextAal: null }));
        return;
      }
      try {
        const account = await loadAccount(supabase, session);
        if (seq !== loadSeq.current) return;
        setState((s) => ({ ...s, status: 'signed-in', session, signedOutTo: null, ...account }));
      } catch {
        if (seq !== loadSeq.current) return;
        setState((s) => ({ ...s, status: 'error', session, profile: null }));
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session);
    });
    // Supabase advises against awaiting other Supabase calls inside this callback, so the account
    // load is deferred to the next task.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'TOKEN_REFRESHED') {
        setState((s) => (s.session ? { ...s, session } : s));
        return;
      }
      setTimeout(() => {
        if (active) applySession(session);
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase, applySession]);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    await applySession(data.session);
  }, [supabase, applySession]);

  const signOut = useCallback(
    /** @param {{ to?: string }} [options] */
    async (options) => {
      if (!supabase) return;
      // Set before the session ends, so guards send the user to this page and not to a
      // "next" link back into the area they just left.
      setState((s) => ({ ...s, signedOutTo: options?.to ?? '/login' }));
      await supabase.auth.signOut({ scope: 'local' });
      await applySession(null);
    },
    [supabase, applySession],
  );

  const value = useMemo(() => ({ ...state, refresh, signOut }), [state, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** @returns {AuthContextValue} */
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/** For tests: renders children with a fixed auth state. */
export const AuthContextForTests = AuthContext;
