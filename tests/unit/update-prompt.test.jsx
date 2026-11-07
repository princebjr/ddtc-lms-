// @vitest-environment jsdom
// "New version available" (UI_FEEDBACK.md catalogue) appears only when a newer version is waiting
// behind an older one that is running this page. On a first visit nothing older is running: Firefox
// reports the first install as an update when a second page loads while the app is still being
// saved for offline use, and that must not raise the toast (found in CI on Phase 6).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast as sonner } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/ToastProvider.jsx';
import { UpdatePrompt } from '@/components/feedback/UpdatePrompt.jsx';

const pwa = vi.hoisted(() => ({
  /** @type {{ onNeedRefresh?: () => void } | null} */
  options: null,
  update: /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (null)),
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: (/** @type {{ onNeedRefresh?: () => void }} */ options) => {
    pwa.options = options;
    return pwa.update;
  },
}));

/** @param {object | null} controller the worker running this page, if any */
function withServiceWorker(controller) {
  Object.defineProperty(navigator, 'serviceWorker', { value: { controller }, configurable: true });
}

async function renderPrompt() {
  render(
    <ToastProvider>
      <UpdatePrompt />
    </ToastProvider>,
  );
  await vi.waitFor(() => expect(pwa.options).not.toBeNull());
}

/** Sonner draws toasts on a timer: let it run before looking. */
const nextTimers = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

describe('UpdatePrompt', () => {
  beforeEach(() => {
    pwa.options = null;
    pwa.update = vi.fn();
    vi.stubEnv('PROD', true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    // Sonner keeps toasts in module state and replays them to the next Toaster: clear them.
    sonner.dismiss();
  });

  it('offers Refresh when a newer version is waiting behind the one running this page', async () => {
    withServiceWorker({ state: 'activated' });
    await renderPrompt();
    act(() => pwa.options?.onNeedRefresh?.());
    expect(await screen.findByText('New version available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(pwa.update).toHaveBeenCalledWith(true);
  });

  it('stays quiet on a first visit, when no older version is running (the first install is not an update)', async () => {
    withServiceWorker(null);
    await renderPrompt();
    act(() => pwa.options?.onNeedRefresh?.());
    await nextTimers();
    expect(screen.queryByText('New version available')).toBeNull();
  });
});
