// @vitest-environment jsdom
// D40 phone navigation: three destination icons plus a permanent More (four items), names only on
// the active item, More opens a sheet with every other destination and Sign out, every item has an
// accessible name, aria-current on the active page. Destinations per role as in D40.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PhoneNav } from '@/components/layout/PhoneNav.jsx';
import { activePillItem, moreSheetDestinations, NAVIGATION, ROLE_KEYS, sidebarGroups } from '@/lib/navigation.js';

describe('navigation config (D40)', () => {
  it.each([
    ['admin', ['Dashboard', 'Users', 'Courses']],
    ['lecturer', ['Dashboard', 'My Courses', 'To grade']],
    ['learner', ['Dashboard', 'My Courses', 'Assignments']],
  ])('%s pill destinations are %j', (role, labels) => {
    const nav = NAVIGATION[/** @type {'admin'} */ (role)];
    expect(nav.pill).toHaveLength(3);
    expect(nav.pill.map((slug) => nav.destinations.find((d) => d.slug === slug)?.label)).toEqual(labels);
  });

  it('every destination lives under a pill item or under More', () => {
    for (const role of ROLE_KEYS) {
      for (const d of NAVIGATION[role].destinations) expect([...NAVIGATION[role].pill, 'more']).toContain(d.under);
    }
  });

  it('More lists every destination that is not in the pill', () => {
    for (const role of ROLE_KEYS) {
      const nav = NAVIGATION[role];
      expect(moreSheetDestinations(role).length).toBe(nav.destinations.length - 3);
    }
  });

  it('uses the product vocabulary: never "module" or "term"', () => {
    const words = ROLE_KEYS.flatMap((r) => NAVIGATION[r].destinations.flatMap((d) => [d.label, d.title, d.description]));
    for (const word of words) expect(word).not.toMatch(/\bmodules?\b|\bterms?\b|\bsemesters?\b/i);
  });

  it('pages under a pill item highlight that item; others highlight More', () => {
    expect(activePillItem('admin', 'lecturers')).toBe('users');
    expect(activePillItem('admin', 'approvals')).toBe('courses');
    expect(activePillItem('admin', 'settings')).toBe('more');
    expect(activePillItem('learner', 'grades')).toBe('more');
  });

  it('the sidebar keeps Profile in the account menu', () => {
    for (const role of ROLE_KEYS) expect(sidebarGroups(role).flatMap((g) => g.items.map((d) => d.slug))).not.toContain('profile');
  });
});

/** @param {{ slug?: string, role?: 'admin' | 'lecturer' | 'learner', onSignOut?: () => void }} [opts] */
function renderNav({ slug = 'dashboard', role = 'learner', onSignOut = () => undefined } = {}) {
  return render(
    <MemoryRouter>
      <PhoneNav role={role} basePath="/x" currentSlug={slug} onSignOut={onSignOut} />
    </MemoryRouter>,
  );
}

describe('PhoneNav', () => {
  it('is a navigation landmark with exactly four items: three destinations and More', () => {
    renderNav();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link')).toHaveLength(3);
    expect(within(nav).getAllByRole('button')).toHaveLength(1);
    expect(within(nav).getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('every item has an accessible name and the active page has aria-current', () => {
    renderNav({ slug: 'my-courses' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'My Courses' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Assignments' })).toBeInTheDocument();
  });

  it('shows a name only on the active item', () => {
    renderNav({ slug: 'assignments' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const visibleNames = [...nav.querySelectorAll('span[aria-hidden="false"]')].map((el) => el.textContent);
    expect(visibleNames).toEqual(['Assignments']);
  });

  it('highlights More when the current page lives under it', () => {
    renderNav({ slug: 'grades' });
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('data-active', 'true');
  });

  it('More opens a sheet with every other destination and Sign out', async () => {
    const onSignOut = vi.fn();
    renderNav({ role: 'admin', onSignOut });
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    const labels = within(sheet)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual(moreSheetDestinations('admin').map((d) => d.label));
    // The open sheet is modal, so the bar behind it is hidden from assistive technology.
    expect(document.querySelector('button[aria-label="More"]')).toHaveAttribute('data-active', 'true');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
