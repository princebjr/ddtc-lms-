// @vitest-environment jsdom
// UI_FEEDBACK.md FAB rules: only below 1024 px, only with permission, never on an ARCHIVED course,
// hides on scroll down and while the keyboard is open; speed dial closes on Escape and tap outside.
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUp, UserPlus } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Fab, SpeedDial } from '@/components/feedback/Fab.jsx';

/** @param {number} width */
function setWidth(width) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

afterEach(() => setWidth(1024));

const fabWrapper = () => document.querySelector('[data-slot="fab"]');

describe('Fab', () => {
  it('appears on phones and tablets (below 1024 px)', () => {
    setWidth(375);
    render(<Fab label="New course" allowed onClick={() => undefined} />);
    expect(screen.getByRole('button', { name: 'New course' })).toBeInTheDocument();
    setWidth(1023);
    expect(screen.getByRole('button', { name: 'New course' })).toBeInTheDocument();
  });

  it('does not exist at 1024 px and wider (desktop uses a header button)', () => {
    setWidth(1024);
    render(<Fab label="New course" allowed onClick={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'New course' })).toBeNull();
  });

  it('is not shown without permission', () => {
    setWidth(375);
    render(<Fab label="New course" allowed={false} onClick={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is not shown on an ARCHIVED course', () => {
    setWidth(375);
    render(<Fab label="Add lesson" allowed archived onClick={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('runs its action and has an accessible name', async () => {
    setWidth(375);
    const onClick = vi.fn();
    render(<Fab label="New course" allowed onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'New course' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('hides while scrolling down and returns on scroll up', () => {
    setWidth(375);
    render(<Fab label="New course" allowed onClick={() => undefined} />);
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 200 });
      window.dispatchEvent(new Event('scroll'));
    });
    expect(fabWrapper()).toHaveAttribute('data-hidden', 'true');
    act(() => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
      window.dispatchEvent(new Event('scroll'));
    });
    expect(fabWrapper()).not.toHaveAttribute('data-hidden');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('hides while the on-screen keyboard is open (a text field has focus)', () => {
    setWidth(375);
    render(
      <>
        <input aria-label="Search" />
        <Fab label="New course" allowed onClick={() => undefined} />
      </>,
    );
    act(() => screen.getByLabelText('Search').focus());
    expect(fabWrapper()).toHaveAttribute('data-hidden', 'true');
    act(() => screen.getByLabelText('Search').blur());
    expect(fabWrapper()).not.toHaveAttribute('data-hidden');
  });

  it('reserves space so toasts sit above it, and releases it when removed', () => {
    setWidth(375);
    const { unmount } = render(<Fab label="New course" allowed onClick={() => undefined} />);
    expect(document.documentElement.style.getPropertyValue('--fab-clearance')).not.toBe('');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--fab-clearance')).toBe('');
  });
});

describe('SpeedDial', () => {
  const actions = [
    { label: 'Add learner', icon: UserPlus, onSelect: vi.fn() },
    { label: 'Import CSV', icon: FileUp, onSelect: vi.fn() },
  ];

  it('opens labelled actions and closes on Escape', async () => {
    setWidth(375);
    render(<SpeedDial label="Add" allowed actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Add learner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Add learner' })).toBeNull();
  });

  it('runs the chosen action and closes', async () => {
    setWidth(375);
    render(<SpeedDial label="Add" allowed actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }));
    expect(actions[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Add learner' })).toBeNull();
  });

  it('closes on the browser Back button', async () => {
    setWidth(375);
    render(<SpeedDial label="Add" allowed actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    act(() => void window.dispatchEvent(new PopStateEvent('popstate')));
    expect(screen.queryByRole('button', { name: 'Add learner' })).toBeNull();
  });

  it('closes on a tap outside (the scrim)', async () => {
    setWidth(375);
    render(<SpeedDial label="Add" allowed actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    const scrim = document.querySelector('.bg-scrim');
    expect(scrim).not.toBeNull();
    fireEvent.pointerDown(/** @type {Element} */ (scrim));
    fireEvent.pointerUp(/** @type {Element} */ (scrim));
    fireEvent.click(/** @type {Element} */ (scrim));
    expect(screen.queryByRole('button', { name: 'Add learner' })).toBeNull();
  });

  it('is not shown on desktop or without permission', () => {
    setWidth(1280);
    const { unmount } = render(<SpeedDial label="Add" allowed actions={actions} />);
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    unmount();
    setWidth(375);
    render(<SpeedDial label="Add" allowed={false} actions={actions} />);
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });
});
