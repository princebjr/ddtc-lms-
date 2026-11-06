// @vitest-environment jsdom
// Phase 3 auth screens: brand block directly below the whole Sign In and Sign Up forms (Google
// button included), exact brand text, field attributes for phones (RESPONSIVE.md 15), no role field
// on Sign Up, clear blocked-account messages, and the in-app-browser handling of Google (D27 item 8).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSkeleton, INSTITUTION_NAME, TAGLINE } from '@/components/auth/AuthLayout.jsx';
import { AuthContextForTests } from '@/components/auth/AuthProvider.jsx';
import { IN_APP_GOOGLE_MESSAGE } from '@/components/auth/GoogleSection.jsx';
import { BRAND_LINE } from '@/components/brand/BrandBlock.jsx';
import { ToastProvider } from '@/components/feedback/ToastProvider.jsx';
import { ThemeProvider } from '@/components/theme/ThemeProvider.jsx';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage.jsx';
import LoginPage, { BLOCKED_MESSAGES, EXPIRED_MESSAGE } from '@/pages/auth/LoginPage.jsx';
import MfaPage from '@/pages/auth/MfaPage.jsx';
import SignUpPage from '@/pages/auth/SignUpPage.jsx';
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage.jsx';

vi.mock('@/lib/supabase.js', () => ({
  getSupabase: () => ({
    auth: {
      mfa: { listFactors: () => new Promise(() => {}) },
      signInWithOAuth: vi.fn(async () => ({ error: null })),
    },
  }),
}));

/** @type {import('@/components/auth/AuthProvider.jsx').AuthContextValue} */
const signedOut = {
  status: 'signed-out',
  session: null,
  profile: null,
  aal: null,
  nextAal: null,
  configured: true,
  signedOutTo: null,
  refresh: async () => {},
  signOut: async () => {},
};

/** @param {import('react').ReactElement} ui @param {string} [path] */
function renderPage(ui, path = '/login') {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <AuthContextForTests.Provider value={signedOut}>
          <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
        </AuthContextForTests.Provider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

/**
 * The brand block must be the element straight after the card that holds the whole form.
 * @param {HTMLElement} container
 */
function expectBrandDirectlyBelowForm(container) {
  const brand = container.querySelector('[data-slot="brand-block"]');
  expect(brand).not.toBeNull();
  const card = /** @type {HTMLElement} */ (brand?.previousElementSibling);
  expect(card?.tagName).toBe('SECTION');
  // The card holds the form and the Google button; the brand block comes after both.
  expect(card.querySelector('form')).not.toBeNull();
  expect(card.querySelector('[data-slot="google-button"]')).not.toBeNull();
  // Logo first, then exactly "from gölarae", nothing in between.
  const [logo, text, ...rest] = /** @type {HTMLElement} */ (brand).children;
  expect(logo.getAttribute('data-slot')).toBe('logo-mark');
  expect(text.textContent).toBe(BRAND_LINE);
  expect(rest).toHaveLength(0);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sign In', () => {
  it('has the brand block directly below the whole form, Google button included', () => {
    const { container } = renderPage(<LoginPage />);
    expectBrandDirectlyBelowForm(container);
    expect(BRAND_LINE).toBe('from gölarae');
    expect(container.textContent?.toLowerCase()).not.toContain('powered by');
  });

  it('puts the "or" divider and Continue with Google below the Sign In button', () => {
    const { container } = renderPage(<LoginPage />);
    const submit = screen.getByRole('button', { name: 'Sign In' });
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    expect(submit.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(container).getByRole('separator', { name: 'or' })).toBeTruthy();
  });

  it('uses phone-friendly field types and autocomplete', () => {
    renderPage(<LoginPage />);
    const email = screen.getByLabelText('Email address');
    expect(email.getAttribute('type')).toBe('email');
    expect(email.getAttribute('inputmode')).toBe('email');
    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
  });

  it('shows inline errors instead of submitting an empty form', () => {
    renderPage(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByText('Enter your email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
  });

  it('explains a suspended, a deactivated and an expired session', () => {
    const one = renderPage(<LoginPage />, '/login?blocked=suspended');
    expect(screen.getByRole('alert').textContent).toBe(BLOCKED_MESSAGES.suspended);
    one.unmount();
    const two = renderPage(<LoginPage />, '/login?blocked=deactivated');
    expect(screen.getByRole('alert').textContent).toBe(BLOCKED_MESSAGES.deactivated);
    two.unmount();
    renderPage(<LoginPage />, '/login?expired=1');
    expect(screen.getByRole('alert').textContent).toBe(EXPIRED_MESSAGE);
  });

  it('inside an in-app browser, Google explains how to open the page instead of failing', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit Instagram 300.0' });
    renderPage(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('alert').textContent).toBe(IN_APP_GOOGLE_MESSAGE('Instagram'));
  });
});

describe('Sign Up', () => {
  it('has the brand block directly below the whole form, Google button included', () => {
    const { container } = renderPage(<SignUpPage />, '/signup');
    expectBrandDirectlyBelowForm(container);
  });

  it('asks for first name, second name, email and password, and never for a role', () => {
    const { container } = renderPage(<SignUpPage />, '/signup');
    expect(screen.getByLabelText('First name').getAttribute('autocomplete')).toBe('given-name');
    expect(screen.getByLabelText('Second name').getAttribute('autocomplete')).toBe('family-name');
    expect(screen.getByLabelText('Email address').getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('new-password');
    const names = [...container.querySelectorAll('input')].map((i) => i.name);
    expect(names).toEqual(['firstName', 'secondName', 'email', 'password']);
  });

  it('requires both names before anything is sent', () => {
    renderPage(<SignUpPage />, '/signup');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter your first name')).toBeTruthy();
    expect(screen.getByText('Enter your second name')).toBeTruthy();
  });
});

describe('other auth screens', () => {
  it('Forgot password has no brand block (it belongs under Sign In and Sign Up only)', () => {
    const { container } = renderPage(<ForgotPasswordPage />, '/forgot-password');
    expect(container.querySelector('[data-slot="brand-block"]')).toBeNull();
  });

  it('every text input is at least 16 px (no iOS zoom): inputs use the body size', () => {
    const { container } = renderPage(<SignUpPage />, '/signup');
    for (const input of container.querySelectorAll('input')) expect(input.className).toContain('text-body');
  });

  it('the MFA page shows its loading skeleton while factors load', () => {
    const { container } = renderPage(<MfaPage />, '/mfa');
    expect(container.querySelector('[data-slot="auth-skeleton"]')).not.toBeNull();
  });
});

// Owner request 2026-11-05: the name in bold with the tagline beneath it at every width (phones
// included, verification pages included), the DDTC emblem fades in, and only the Sign In and
// Sign Up cards carry the moving edge glow.
describe('auth hero and card glow', () => {
  // The emblem skips its fade only when a skeleton left within the last 100 ms; move the clock on
  // so a skeleton from an earlier test does not count as a handover.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** @param {HTMLElement} container */
  function hero(container) {
    const name = screen.getByText(INSTITUTION_NAME);
    const tagline = screen.getByText(TAGLINE);
    const logo = /** @type {HTMLElement} */ (container.querySelector('[data-logo="ddtc"]'));
    return { name, tagline, logo };
  }

  it.each([
    ['Sign In', <LoginPage key="in" />, '/login'],
    ['Sign Up', <SignUpPage key="up" />, '/signup'],
    ['Forgot password', <ForgotPasswordPage key="fp" />, '/forgot-password'],
    ['Verify email', <VerifyEmailPage key="ve" />, '/verify-email'],
  ])('%s shows the bold name, the tagline beneath it on every width, and fades the emblem in', (_name, ui, path) => {
    const { container } = renderPage(ui, path);
    const { name, tagline, logo } = hero(container);
    expect(name.className).toContain('font-bold');
    // Not hidden on phones: no `hidden` class that only `lg:block` undoes.
    expect(tagline.className.split(/\s+/)).not.toContain('hidden');
    expect(name.nextElementSibling).toBe(tagline);
    expect(logo.className).toContain('animate-logo-fade-in');
  });

  it('Sign In and Sign Up cards glow; other auth cards do not', () => {
    for (const [ui, path] of /** @type {const} */ ([
      [<LoginPage key="in" />, '/login'],
      [<SignUpPage key="up" />, '/signup'],
    ])) {
      const { container, unmount } = renderPage(ui, path);
      const card = container.querySelector('section[aria-labelledby="auth-title"]');
      expect(card?.className).toContain('glow-edge');
      // The halo sits behind the card, so the card's parent is its own stacking context.
      expect(card?.parentElement?.className).toContain('isolate');
      unmount();
    }
    const { container } = renderPage(<ForgotPasswordPage />, '/forgot-password');
    expect(container.querySelector('section[aria-labelledby="auth-title"]')?.className).not.toContain('glow-edge');
  });

  it('the session-check skeleton for Sign In and Sign Up has the same glowing card; step skeletons do not', () => {
    const { container, unmount } = render(<AuthSkeleton />);
    expect(container.querySelector('.glow-edge')).not.toBeNull();
    unmount();
    const step = render(<AuthSkeleton fields={1} brand={false} />);
    expect(step.container.querySelector('.glow-edge')).toBeNull();
  });

  it('the emblem does not fade a second time when the skeleton hands over to the page', () => {
    const skeleton = render(<AuthSkeleton />);
    expect(skeleton.container.querySelector('[data-logo="ddtc"]')?.className).toContain('animate-logo-fade-in');
    skeleton.unmount();
    const { container } = renderPage(<LoginPage />, '/login');
    expect(container.querySelector('[data-logo="ddtc"]')?.className).not.toContain('animate-logo-fade-in');
  });
});
