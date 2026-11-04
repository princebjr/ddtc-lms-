import { useEffect, useState } from 'react';

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'datetime-local', 'time', 'month', 'week']);

/**
 * True when an element that opens the on-screen keyboard has focus.
 * @param {Element | null} el
 * @returns {boolean}
 */
export function opensKeyboard(el) {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Best-effort on-screen keyboard detection for phones and tablets: a focused text field, or the
 * visual viewport shrinking well below the layout viewport (iOS Safari and Android Chrome).
 * @returns {boolean}
 */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const focused = opensKeyboard(document.activeElement);
      const shrunk = vv ? vv.height < window.innerHeight * 0.75 : false;
      setOpen(focused || shrunk);
    };
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    vv?.addEventListener('resize', update);
    update();
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      vv?.removeEventListener('resize', update);
    };
  }, []);

  return open;
}
