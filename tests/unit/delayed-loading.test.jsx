// @vitest-environment jsdom
// Skeleton timing (UI_FEEDBACK.md): show only after 150 ms, keep at least 300 ms once shown,
// error state with Retry after 10 seconds; aria-busy and a hidden "Loading" label.
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { LoadingRegion } from '@/components/feedback/Skeletons.jsx';
import { LOADING_TIMEOUT_MS, SKELETON_DELAY_MS, SKELETON_MIN_VISIBLE_MS, useDelayedLoading } from '@/hooks/use-delayed-loading.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** @param {number} ms */
const advance = (ms) => act(() => void vi.advanceTimersByTime(ms));

describe('useDelayedLoading', () => {
  it('uses the documented values', () => {
    expect(SKELETON_DELAY_MS).toBe(150);
    expect(SKELETON_MIN_VISIBLE_MS).toBe(300);
    expect(LOADING_TIMEOUT_MS).toBe(10_000);
  });

  it('never shows a skeleton for loads under 150 ms', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    expect(result.current).toBe('blank');
    advance(149);
    expect(result.current).toBe('blank');
    rerender({ loading: false });
    expect(result.current).toBe('content');
    advance(1000);
    expect(result.current).toBe('content');
  });

  it('shows the skeleton after 150 ms and keeps it at least 300 ms', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    advance(150);
    expect(result.current).toBe('skeleton');
    advance(50);
    rerender({ loading: false });
    expect(result.current).toBe('skeleton');
    advance(249);
    expect(result.current).toBe('skeleton');
    advance(1);
    expect(result.current).toBe('content');
  });

  it('hides at once when the skeleton has already been visible 300 ms', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    advance(150 + 400);
    rerender({ loading: false });
    advance(0);
    expect(result.current).toBe('content');
  });

  it('switches to the timeout state after 10 seconds', () => {
    const { result } = renderHook(() => useDelayedLoading(true));
    advance(9_999);
    expect(result.current).toBe('skeleton');
    advance(1);
    expect(result.current).toBe('timeout');
  });

  it('a new load after a timeout starts fresh', () => {
    const { result, rerender } = renderHook(({ loading }) => useDelayedLoading(loading), { initialProps: { loading: true } });
    advance(10_000);
    expect(result.current).toBe('timeout');
    rerender({ loading: false });
    advance(300);
    rerender({ loading: true });
    expect(result.current).not.toBe('timeout');
  });
});

describe('LoadingRegion', () => {
  it('marks the region busy with a hidden Loading label, then shows content', () => {
    const { rerender } = render(
      <LoadingRegion loading skeleton={<div data-testid="skeleton" />}>
        <p>Ready</p>
      </LoadingRegion>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.getByRole('status').parentElement).toHaveAttribute('aria-busy', 'true');
    advance(150);
    expect(screen.getByTestId('skeleton')).toBeVisible();
    rerender(
      <LoadingRegion loading={false} skeleton={<div data-testid="skeleton" />}>
        <p>Ready</p>
      </LoadingRegion>,
    );
    advance(300);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows an error state with Retry after 10 seconds, clearly different from loading', () => {
    const retry = vi.fn();
    render(
      <LoadingRegion loading skeleton={<div />} onRetry={retry}>
        <p>Ready</p>
      </LoadingRegion>,
    );
    advance(10_000);
    expect(screen.getByRole('alert')).toHaveTextContent('This is taking too long');
    act(() => screen.getByRole('button', { name: 'Retry' }).click());
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
