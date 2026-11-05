// @vitest-environment jsdom
// D39 and CLAUDE.md: the brand block is the gölarae logo directly above the exact text
// "from gölarae", with nothing between them; "powered by gölarae" never appears. LogoMark paints
// through the logo token. The Google button follows D27 (label, official mark, not a primary button).
import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_LINE, BrandBlock } from '@/components/brand/BrandBlock.jsx';
import { GOOGLE_BUTTON_LABEL, GoogleButton } from '@/components/brand/GoogleButton.jsx';
import { LogoMark } from '@/components/brand/LogoMark.jsx';

describe('BrandBlock', () => {
  it('shows the gölarae logo directly above the exact text "from gölarae", nothing between', () => {
    const { container } = render(<BrandBlock />);
    const block = /** @type {HTMLElement} */ (container.querySelector('[data-slot="brand-block"]'));
    const children = [...block.children];
    expect(children).toHaveLength(2);
    expect(children[0]).toHaveAttribute('data-logo', 'golarae');
    expect(children[1].textContent).toBe('from gölarae');
    expect(BRAND_LINE).toBe('from gölarae');
  });

  it('the logo has an accessible name', () => {
    render(<BrandBlock />);
    expect(screen.getByRole('img', { name: 'gölarae logo' })).toBeInTheDocument();
  });
});

describe('LogoMark', () => {
  it('paints through the logo token (navy on light, white on dark) by default', () => {
    const { container } = render(<LogoMark logo="ddtc" />);
    const el = /** @type {HTMLElement} */ (container.firstElementChild);
    expect(el.className).toContain('bg-logo');
    expect(el.style.maskImage || el.style.getPropertyValue('mask-image')).toContain('url(');
  });

  it('can be forced to navy or white only', () => {
    const navy = render(<LogoMark logo="ddtc" tone="navy" />).container.firstElementChild;
    const white = render(<LogoMark logo="ddtc" tone="white" />).container.firstElementChild;
    expect(navy?.className).toContain('bg-logo-navy');
    expect(white?.className).toContain('bg-logo-white');
  });

  it('is hidden from assistive technology when decorative', () => {
    const { container } = render(<LogoMark logo="ddtc" label={null} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('GoogleButton (D27)', () => {
  it('says "Continue with Google", shows the G mark and is not a primary button', () => {
    const { container } = render(<GoogleButton />);
    const button = screen.getByRole('button', { name: GOOGLE_BUTTON_LABEL });
    expect(GOOGLE_BUTTON_LABEL).toBe('Continue with Google');
    expect(container.querySelector('img')).not.toBeNull();
    expect(button.className).not.toMatch(/\bbg-primary\b/);
    expect(button.className).toContain('w-full');
    expect(button.className).toContain('h-12');
  });
});

describe('product wording', () => {
  /** @param {string} dir @returns {string[]} */
  const files = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(js|jsx|html|css)$/.test(n) ? [p] : [];
    });
  const sources = [...files('src'), 'index.html'].map((f) => [f, readFileSync(f, 'utf8')]);

  it('never says "powered by gölarae"', () => {
    expect(sources.filter(([, t]) => /powered by/i.test(t)).map(([f]) => f)).toEqual([]);
  });

  it('never uses "module" or "term" as product words in user-facing text', () => {
    const text = sources.filter(([f]) => /\.(jsx|html)$/.test(f));
    const offenders = text.filter(([, t]) => />[^<]*\b(modules?|terms?|semesters?)\b[^<]*</i.test(t)).map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});
