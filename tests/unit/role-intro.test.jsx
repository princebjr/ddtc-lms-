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
