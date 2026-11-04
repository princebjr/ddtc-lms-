import { createContext, useContext, useState } from 'react';
import { toast as sonner, Toaster } from 'sonner';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/use-media-query.js';
import { MAX_VISIBLE_TOASTS } from '@/lib/toast/catalogue.js';
import { createToastController } from '@/lib/toast/controller.js';
import { ToastCard } from './ToastCard.jsx';

/** @typedef {import('@/lib/toast/controller.js').ToastController} ToastController */

/** @type {import('react').Context<ToastController | null>} */
const ToastContext = createContext(/** @type {ToastController | null} */ (null));

/**
 * Builds the app-wide controller with Sonner as the renderer. Sonner only positions and animates;
 * timing, de-duplication and the limit of 3 are the controller's (src/lib/toast/controller.js).
 * @returns {ToastController}
 */
function createSonnerController() {
  /** @type {ToastController} */
  const controller = createToastController({
    render(state) {
      sonner.custom(
        () => (
          <ToastCard
            state={state}
            onDismiss={() => controller.dismiss(state.key)}
            onAction={() => controller.runAction(state.key)}
            onPause={() => controller.pause(state.key)}
            onResume={() => controller.resume(state.key)}
          />
        ),
        { id: state.key, duration: Number.POSITIVE_INFINITY, dismissible: false, unstyled: true },
      );
    },
    remove(key) {
      sonner.dismiss(key);
    },
  });
  return controller;
}

/**
 * Toasts sit at the bottom on phones and tablets (above the tab bar, any FAB and the safe area)
 * and top right on desktop (UI_FEEDBACK.md toast rules).
 * @param {{ children: import('react').ReactNode }} props
 */
export function ToastProvider({ children }) {
  const [controller] = useState(createSonnerController);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const bottomOffset = 'var(--toast-bottom-offset)';

  return (
    <ToastContext.Provider value={controller}>
      {children}
      <Toaster
        position={desktop ? 'top-right' : 'bottom-center'}
        visibleToasts={MAX_VISIBLE_TOASTS}
        expand
        gap={8}
        offset={desktop ? { top: 'var(--toast-edge)', right: 'var(--toast-edge)' } : { bottom: bottomOffset, left: 'var(--toast-edge)', right: 'var(--toast-edge)' }}
        mobileOffset={{ bottom: bottomOffset, left: 'var(--toast-edge)', right: 'var(--toast-edge)' }}
        containerAriaLabel="Notifications"
        toastOptions={{ unstyled: true, className: 'w-full' }}
        style={desktop ? { width: 'var(--toast-width)' } : undefined}
      />
    </ToastContext.Provider>
  );
}

/** @returns {ToastController} */
export function useToast() {
  const controller = useContext(ToastContext);
  if (!controller) throw new Error('useToast must be used inside ToastProvider');
  return controller;
}
