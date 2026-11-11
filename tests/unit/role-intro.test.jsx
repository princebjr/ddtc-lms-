// @vitest-environment jsdom
// Owner request of 2026-11-11: each dashboard shows a short introduction for the signed-in role only.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoleIntro } from '@/components/dashboard/RoleIntro.jsx';

describe('the dashboard introduction', () => {
  it('administrators read about managing the institution', () => {
    render(<RoleIntro role="admin" />);
    expect(screen.getByRole('heading', { name: 'Welcome to DDTC LMS administration' })).toBeTruthy();
    expect(screen.getByText('Manage learner, lecturer and administrator accounts.')).toBeTruthy();
    expect(screen.queryByText(/Publish assignments/)).toBeNull();
  });
  it('lecturers read about teaching', () => {
    render(<RoleIntro role="lecturer" />);
    expect(screen.getByRole('heading', { name: 'Welcome to your teaching space' })).toBeTruthy();
    expect(screen.getByText('Grade submissions and give feedback.')).toBeTruthy();
    expect(screen.queryByText(/Manage learner/)).toBeNull();
  });
  it('learners read about studying', () => {
    render(<RoleIntro role="learner" />);
    expect(screen.getByRole('heading', { name: 'Welcome to your learning space' })).toBeTruthy();
    expect(screen.getByText('Listen to audio teachings.')).toBeTruthy();
    expect(screen.queryByText(/Grade submissions/)).toBeNull();
  });
});

// Owner request of 2026-11-11 (second): each point is a list item marked with an arrow, not a dot.
describe('the introduction points', () => {
  it.each(/** @type {const} */ (['admin', 'lecturer', 'learner']))('%s: four points, each with an arrow bullet', (role) => {
    const { container, unmount } = render(<RoleIntro role={role} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    for (const item of items) {
      const arrow = item.querySelector('svg[data-slot="intro-arrow"]');
      expect(arrow).not.toBeNull();
      expect(arrow?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(container.querySelector('ul')?.className).toMatch(/list-none/);
    unmount();
  });
});
