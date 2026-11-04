import { Plus, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState } from 'react';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { useKeyboardOpen } from '@/hooks/use-keyboard-open.js';
import { useScrollDirection } from '@/hooks/use-scroll-direction.js';
import { cn } from '@/lib/utils.js';

// Floating action button (UI_FEEDBACK.md, DESIGN.md 12.2): one per screen, only for its main create
// action, only below 1024 px (desktop uses a header button). 56 px, 16 px from the right edge,
// above the tab bar and safe area. Hides on scroll down and while the keyboard is open. Not shown
// without permission or on an ARCHIVED course. Only the screens in the Section 16 FAB table use it.

/**
 * Hides the FAB while scrolling down or typing; reserves space so toasts sit above it.
 * @param {boolean} visible
 */
function useFabPresence(visible) {
  useEffect(() => {
    if (!visible) return undefined;
    const root = document.documentElement;
    root.style.setProperty('--fab-clearance', 'calc(var(--fab-size) + 1rem)');
    return () => {
      root.style.removeProperty('--fab-clearance');
    };
  }, [visible]);
}

/**
 * @typedef {object} FabVisibilityProps
 * @property {boolean} allowed  the user has permission for this create action
 * @property {boolean} [archived] the course is ARCHIVED: no FAB
 */

/** @param {FabVisibilityProps} props */
export function useFabVisible({ allowed, archived = false }) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return allowed && !archived && !desktop;
}

const fabButtonClass = cn(
  'inline-flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-overlay',
  'transition-[transform,opacity] duration-base ease-standard active:scale-98 focus-visible:focus-ring',
);

/** @param {{ hidden: boolean, children: import('react').ReactNode }} props */
function FabPosition({ hidden, children }) {
  return (
    <div
      data-slot="fab"
      data-hidden={hidden || undefined}
      className={cn(
        'fixed right-4 z-30 transition-[transform,opacity] duration-base ease-standard lg:hidden',
        'bottom-above-nav',
        hidden && 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      {children}
    </div>
  );
}

/**
 * Single-action FAB.
 * @param {FabVisibilityProps & { label: string, onClick: () => void }} props
 */
export function Fab({ label, onClick, allowed, archived }) {
  const visible = useFabVisible({ allowed, archived });
  const scroll = useScrollDirection();
  const keyboard = useKeyboardOpen();
  const hidden = scroll === 'down' || keyboard;
  useFabPresence(visible);
  if (!visible) return null;
  return (
    <FabPosition hidden={hidden}>
      <button type="button" className={fabButtonClass} onClick={onClick} aria-label={label} tabIndex={hidden ? -1 : undefined}>
        <Plus className="size-6" aria-hidden="true" />
      </button>
    </FabPosition>
  );
}

/**
 * @typedef {object} SpeedDialAction
 * @property {string} label
 * @property {import('react').ComponentType<{ className?: string, 'aria-hidden'?: boolean | 'true' }>} icon
 * @property {() => void} onSelect
 */

/**
 * FAB with several actions: opens a speed dial with a scrim and labelled actions; closes on a tap
 * outside, Escape or the browser Back button.
 * @param {FabVisibilityProps & { label: string, actions: SpeedDialAction[] }} props
 */
export function SpeedDial({ label, actions, allowed, archived }) {
  const visible = useFabVisible({ allowed, archived });
  const scroll = useScrollDirection();
  const keyboard = useKeyboardOpen();
  const [open, setOpen] = useState(false);
  const hidden = !open && (scroll === 'down' || keyboard);
  useFabPresence(visible);

  useEffect(() => {
    if (!open) return undefined;
    const onBack = () => setOpen(false);
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [open]);

  if (!visible) return null;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <FabPosition hidden={hidden}>
        <DialogPrimitive.Trigger className={fabButtonClass} aria-label={label} tabIndex={hidden ? -1 : undefined}>
          <Plus className="size-6" aria-hidden="true" />
        </DialogPrimitive.Trigger>
      </FabPosition>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-scrim data-[state=open]:animate-fade-in lg:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed right-4 z-50 flex flex-col items-end gap-3 outline-none data-[state=open]:animate-fade-in lg:hidden',
            'bottom-above-nav',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          <ul className="flex flex-col items-end gap-3">
            {actions.map((action) => (
              <li key={action.label}>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-card px-4 text-label text-ink shadow-overlay hover:bg-fill focus-visible:focus-ring"
                  onClick={() => {
                    setOpen(false);
                    action.onSelect();
                  }}
                >
                  <action.icon className="size-5 text-link" aria-hidden="true" />
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
          <DialogPrimitive.Close className={fabButtonClass} aria-label="Close">
            <X className="size-6" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
