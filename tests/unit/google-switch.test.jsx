// @vitest-environment jsdom
// Phase 14 (owner, 2026-11-14): production launches with email and password only. The Google section is hidden
// when the build switch is off and shown otherwise (the default, so staging and the tests keep it).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoogleSection } from '@/components/auth/GoogleSection.jsx';
import { googleSignInEnabled } from '@/lib/flags.js';

describe('Continue with Google switch', () => {
  it('is on by default', () => {
    expect(googleSignInEnabled).toBe(true);
  });
  it('shows the button and the "or" divider when on', () => {
    render(<GoogleSection enabled />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });
  it('shows nothing when off', () => {
    const { container } = render(<GoogleSection enabled={false} />);
    expect(container.innerHTML).toBe('');
  });
});
