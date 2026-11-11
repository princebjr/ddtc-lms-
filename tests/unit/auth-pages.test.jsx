// @vitest-environment jsdom
// Phase 3 auth screens: brand block directly below the whole Sign In and Sign Up forms (Google
// button included), exact brand text, field attributes for phones (RESPONSIVE.md 15), no role field
// on Sign Up, clear blocked-account messages, and the in-app-browser handling of Google (D27 item 8).
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSkeleton, copyrightLine, INSTITUTION_NAME, TAGLINE } from '@/components/auth/AuthLayout.jsx';
import { AuthContextForTests } from '@/components/auth/AuthProvider.jsx';
import { FormField } from '@/components/auth/FormField.jsx';
import { IN_APP_GOOGLE_MESSAGE } from '@/components/auth/GoogleSection.jsx';
import { BRAND_LINE } from '@/components/brand/BrandBlock.jsx';
import { ToastProvider } from '@/components/feedback/ToastProvider.jsx';
import { ThemeProvider } from '@/components/theme/ThemeProvider.jsx';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage.jsx';
import LoginPage, { BLOCKED_MESSAGES, EXPIRED_MESSAGE, idleMessage } from '@/pages/auth/LoginPage.jsx';
import MfaPage from '@/pages/auth/MfaPage.jsx';
import SignUpPage from '@/pages/auth/SignUpPage.jsx';
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage.jsx';

/** Two-step verification waits for its factors unless a test gives it some. */
const mfa = vi.hoisted(() => ({ factors: /** @type {unknown} */ (null) }));

vi.mock('@/lib/supabase.js', () => ({
  getSupabase: () => ({
    auth: {
      mfa: { listFactors: () => (mfa.factors ? Promise.resolve({ data: mfa.factors, error: null }) : new Promise(() => {})) },
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

  it('after an idle sign-out (D43) says why, as a status rather than an error, until the user signs in', () => {
    expect(idleMessage(10)).toBe('You were signed out after 10 minutes of inactivity.');
    const idle = renderPage(<LoginPage />, '/login?idle=10&next=%2Flearner%2Fdashboard');
    const notice = screen.getByText('You were signed out after 10 minutes of inactivity.');
    // Owner request 2026-11-11: a red border, like the idle warning.
    expect(notice.className).toMatch(/border-2 border-error/);
    expect(notice).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.submit(/** @type {HTMLFormElement} */ (idle.container.querySelector('form')));
    expect(screen.queryByText('You were signed out after 10 minutes of inactivity.')).toBeNull();
    idle.unmount();
    renderPage(<LoginPage />, '/login?idle=0');
    expect(screen.queryByText(/signed out after/)).toBeNull();
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
// Sign Up cards carry the moving edge glow. Owner request 2026-11-07 (ADR-012): the administrator's
// two-step verification card glows too, the same light travels round the emblem's circle on those
// three pages only, and the name ends "(HOJ)".
describe('auth hero and card glow', () => {
  // The emblem skips its fade only when a skeleton left within the last 100 ms; move the clock on
  // so a skeleton from an earlier test does not count as a handover.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    mfa.factors = null;
  });

  it('names the centre "DYNAMIC DISCIPLESHIP TRAINING CENTRE (HOJ)" with the tagline in Twi', () => {
    expect(INSTITUTION_NAME).toBe('DYNAMIC DISCIPLESHIP TRAINING CENTRE (HOJ)');
    expect(TAGLINE).toBe('Di nokware kosi owu mu, na wobenya nkwa abotiri - Adiyisɛm 2:10b');
    renderPage(<LoginPage />, '/login');
    expect(screen.getByText('DYNAMIC DISCIPLESHIP TRAINING CENTRE (HOJ)')).toBeInTheDocument();
    // Screen readers are told the tagline is Twi (WCAG 3.1.2 language of parts).
    expect(screen.getByText(TAGLINE)).toHaveAttribute('lang', 'tw');
  });

  it('ends Sign In and Sign Up with the copyright line, well below the brand block; other pages have none', () => {
    expect(copyrightLine(new Date('2026-11-07T12:00:00Z'))).toBe('© 2026 Dynamic Discipleship Training Centre (HOJ). All rights reserved.');
    // The year is Ghana's (GMT): just past midnight on New Year's Day it is already the new year.
    expect(copyrightLine(new Date('2027-01-01T00:00:30Z'))).toBe('© 2027 Dynamic Discipleship Training Centre (HOJ). All rights reserved.');
    for (const [ui, path] of /** @type {const} */ ([
      [<LoginPage key="in" />, '/login'],
      [<SignUpPage key="up" />, '/signup'],
    ])) {
      const { container, unmount } = renderPage(ui, path);
      const brand = container.querySelector('[data-slot="brand-block"]');
      const copyright = /** @type {HTMLElement} */ (brand?.nextElementSibling);
      expect(copyright.getAttribute('data-slot')).toBe('copyright');
      expect(copyright).toHaveTextContent(copyrightLine());
      expect(copyright.className).toContain('mt-12');
      unmount();
    }
    const { container } = renderPage(<ForgotPasswordPage />, '/forgot-password');
    expect(container.querySelector('[data-slot="copyright"]')).toBeNull();
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

  /**
   * The card glows and the light travels round the emblem's circle; both lights are decorative and
   * hidden from screen readers, and the emblem itself still reads as the DDTC LMS logo.
   * @param {HTMLElement} container
   */
  function expectGlowing(container) {
    const card = container.querySelector('section[aria-labelledby="auth-title"]');
    expect(card?.className).toContain('glow-edge');
    expect(card?.querySelector('[data-slot="glow-ring"]')?.getAttribute('aria-hidden')).toBe('true');
    const logoRing = container.querySelector('[data-slot="logo-glow"] [data-slot="logo-glow-ring"]');
    expect(logoRing?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('img', { name: 'DDTC LMS logo' }).closest('[data-slot="logo-glow"]')).not.toBeNull();
  }

  it('Sign In, Sign Up and two-step verification glow (card and the emblem\'s circle); other auth pages do not', async () => {
    for (const [ui, path] of /** @type {const} */ ([
      [<LoginPage key="in" />, '/login'],
      [<SignUpPage key="up" />, '/signup'],
    ])) {
      const { container, unmount } = renderPage(ui, path);
      expectGlowing(container);
      unmount();
    }
    // The administrator's verification card (the code step).
    mfa.factors = { totp: [{ id: 'f1', status: 'verified' }], all: [] };
    const verify = renderPage(<MfaPage />, '/mfa');
    await screen.findByRole('heading', { name: 'Two-step verification' });
    expectGlowing(verify.container);
    verify.unmount();

    const { container } = renderPage(<ForgotPasswordPage />, '/forgot-password');
    expect(container.querySelector('section[aria-labelledby="auth-title"]')?.className).not.toContain('glow-edge');
    expect(container.querySelector('[data-slot="glow-ring"]')).toBeNull();
    expect(container.querySelector('[data-slot="logo-glow"]')).toBeNull();
  });

  it('two-step verification glows while it loads too, so nothing jumps when the card appears', () => {
    const { container } = renderPage(<MfaPage />, '/mfa');
    expect(container.querySelector('[data-slot="auth-skeleton"] .glow-edge')).not.toBeNull();
    expect(container.querySelector('[data-slot="auth-skeleton"] [data-slot="logo-glow-ring"]')).not.toBeNull();
  });

  it('the session-check skeleton for Sign In and Sign Up has the same glowing card; step skeletons do not', () => {
    const { container, unmount } = render(<AuthSkeleton />);
    expect(container.querySelector('.glow-edge')).not.toBeNull();
    unmount();
    const step = render(<AuthSkeleton fields={1} brand={false} />);
    expect(step.container.querySelector('.glow-edge')).toBeNull();
    expect(step.container.querySelector('[data-slot="logo-glow"]')).toBeNull();
  });

  it('the emblem does not fade a second time when the skeleton hands over to the page', () => {
    const skeleton = render(<AuthSkeleton />);
    expect(skeleton.container.querySelector('[data-logo="ddtc"]')?.className).toContain('animate-logo-fade-in');
    skeleton.unmount();
    const { container } = renderPage(<LoginPage />, '/login');
    expect(container.querySelector('[data-logo="ddtc"]')?.className).not.toContain('animate-logo-fade-in');
  });
});

// The focused field is kept above the on-screen keyboard. Found by CI (courses.spec.js on iPhone SE):
// the scroll used to run 300 ms after every focus, so a tap on Sign In at that moment landed where
// the button had been. It now moves the page only when the field still has the focus and cannot be
// seen (the keyboard covers it); a field in view never moves.
describe('the focused field and the on-screen keyboard', () => {
  const scrollIntoView = vi.fn();

  /** @param {{ top: number, bottom: number }} box where the field is @param {{ offsetTop: number, height: number }} view what can be seen */
  function focusedField(box, view) {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: view });
    render(
      <>
        <FormField label="Password" name="password" type="password" />
        <button type="button">Sign In</button>
      </>,
    );
    const input = screen.getByLabelText('Password');
    input.getBoundingClientRect = () => /** @type {DOMRect} */ ({ top: box.top, bottom: box.bottom, left: 0, right: 300, width: 300, height: box.bottom - box.top, x: 0, y: box.top, toJSON: () => ({}) });
    act(() => input.focus());
    return input;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView; // jsdom has none
  });
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error jsdom has none; removed again after each test
    delete Element.prototype.scrollIntoView;
    // @ts-expect-error jsdom has none; removed again after each test
    delete window.visualViewport;
  });

  it('brings a field the keyboard covers to the middle once the keyboard has had time to open', () => {
    focusedField({ top: 490, bottom: 538 }, { offsetTop: 0, height: 300 });
    act(() => vi.advanceTimersByTime(299));
    expect(scrollIntoView).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('leaves a field that can be seen where it is, so nothing moves under a finger about to tap', () => {
    focusedField({ top: 490, bottom: 538 }, { offsetTop: 0, height: 568 });
    act(() => vi.advanceTimersByTime(1000));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing once the focus has moved on', () => {
    focusedField({ top: 490, bottom: 538 }, { offsetTop: 0, height: 300 });
    act(() => screen.getByRole('button', { name: 'Sign In' }).focus());
    act(() => vi.advanceTimersByTime(1000));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
