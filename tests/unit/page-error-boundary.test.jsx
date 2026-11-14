// @vitest-environment jsdom
// Phase 15 (D45 stability): a screen that fails while drawing shows a friendly error with Try again in place of
// the screen only (the menus around it stay); Try again draws it again; another page starts clean.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageErrorBoundary } from '@/components/feedback/PageErrorBoundary.jsx';

const state = { broken: true };
function Screen() {
  if (state.broken) throw new Error('boom');
  return <p>The screen</p>;
}

beforeEach(() => {
  state.broken = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('PageErrorBoundary', () => {
  it('replaces only the failing screen with a friendly error, keeping what is around it', () => {
    render(
      <div>
        <nav>Menu</nav>
        <PageErrorBoundary resetKey="/learner/grades">
          <Screen />
        </PageErrorBoundary>
      </div>,
    );
    expect(screen.getByText('Menu')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This page could not be shown.');
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('Try again draws the screen again', () => {
    render(
      <PageErrorBoundary resetKey="/learner/grades">
        <Screen />
      </PageErrorBoundary>,
    );
    state.broken = false;
    act(() => screen.getByRole('button', { name: /Try again|Retry/ }).click());
    expect(screen.getByText('The screen')).toBeInTheDocument();
  });

  it('another page starts clean, and coming back tries again', () => {
    const { rerender } = render(
      <PageErrorBoundary resetKey="/learner/grades">
        <Screen />
      </PageErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    state.broken = false;
    rerender(
      <PageErrorBoundary resetKey="/learner/dashboard">
        <Screen />
      </PageErrorBoundary>,
    );
    expect(screen.getByText('The screen')).toBeInTheDocument();
    rerender(
      <PageErrorBoundary resetKey="/learner/grades">
        <Screen />
      </PageErrorBoundary>,
    );
    expect(screen.getByText('The screen')).toBeInTheDocument();
  });
});
