// @vitest-environment jsdom
// /auth/confirm with Supabase's default emails (PKCE `code`): the page must use the address the
// app was opened with, because the Supabase client removes `code` from the address bar on start-up,
// possibly before this lazily loaded page renders (found in CI on PR #7).
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContextForTests } from '@/components/auth/AuthProvider.jsx';
import { ThemeProvider } from '@/components/theme/ThemeProvider.jsx';

const opened = vi.hoisted(() => ({ url: '' }));
vi.mock('@/lib/auth/initial-url.js', () => ({
  get INITIAL_URL() {
    return opened.url;
  },
}));
const setSession = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock('@/lib/supabase.js', () => ({ getSupabase: () => ({ auth: { verifyOtp: async () => ({ error: null }), setSession } }) }));

const { default: ConfirmPage } = await import('@/pages/auth/ConfirmPage.jsx');

/** @param {'loading' | 'signed-in' | 'signed-out'} status */
function renderAt(status) {
  // What the address bar shows once the client has removed the code.
  const u = new URL(opened.url);
  window.history.replaceState(null, '', '/auth/confirm?type=' + (u.searchParams.get('type') ?? new URLSearchParams(u.hash.slice(1)).get('type')) + u.hash);
  /** @type {any} */
  const auth = { status, session: null, profile: null, aal: null, nextAal: null, configured: true, signedOutTo: null, refresh: async () => {}, signOut: async () => {} };
  return render(
    <ThemeProvider>
      <AuthContextForTests.Provider value={auth}>
        <MemoryRouter initialEntries={['/auth/confirm']}>
          <Routes>
            <Route path="/auth/confirm" element={<ConfirmPage />} />
            <Route path="/reset-password" element={<p>reset page</p>} />
            <Route path="/" element={<p>home</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContextForTests.Provider>
    </ThemeProvider>,
  );
}

describe('/auth/confirm with a PKCE code', () => {
  it('a recovery link goes to Choose a new password once the code is exchanged, even after the code left the address bar', () => {
    opened.url = 'http://localhost/auth/confirm?type=recovery&code=abc';
    renderAt('signed-in');
    expect(screen.getByText('reset page')).toBeTruthy();
  });

  it('a sign-up link goes on to the app once signed in', () => {
    opened.url = 'http://localhost/auth/confirm?type=signup&code=abc';
    renderAt('signed-in');
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('waits (skeleton) while the code is being exchanged', () => {
    opened.url = 'http://localhost/auth/confirm?type=signup&code=abc';
    const { container } = renderAt('loading');
    expect(container.querySelector('[data-slot="auth-skeleton"]')).not.toBeNull();
  });

  it('a sign-up link opened on another device says the email is verified and asks to sign in', () => {
    opened.url = 'http://localhost/auth/confirm?type=signup&code=abc';
    renderAt('signed-out');
    expect(screen.getByRole('heading', { name: 'Your email is verified' })).toBeTruthy();
  });

  it('a recovery link that cannot be exchanged explains that the link cannot be used', () => {
    opened.url = 'http://localhost/auth/confirm?type=recovery&code=abc';
    renderAt('signed-out');
    expect(screen.getByRole('heading', { name: 'This link cannot be used' })).toBeTruthy();
  });

  it('an administrator invitation (tokens in the hash) starts the session, clears the tokens and goes to choose a password', async () => {
    opened.url = 'http://localhost/auth/confirm?type=invite#access_token=aaa&refresh_token=bbb&type=invite';
    renderAt('signed-out');
    expect(await screen.findByText('reset page')).toBeTruthy();
    expect(setSession).toHaveBeenCalledWith({ access_token: 'aaa', refresh_token: 'bbb' });
    expect(window.location.hash).toBe('');
  });
});
