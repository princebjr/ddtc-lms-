import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, readThemeChoice, resolveTheme, saveThemeChoice } from '@/lib/theme.js';

/** @typedef {import('@/lib/theme.js').ThemeChoice} ThemeChoice */

/**
 * @typedef {object} ThemeContextValue
 * @property {ThemeChoice} choice
 * @property {'light' | 'dark'} resolved
 * @property {(choice: ThemeChoice) => void} setChoice
 */

/** @type {import('react').Context<ThemeContextValue | null>} */
const ThemeContext = createContext(/** @type {ThemeContextValue | null} */ (null));

/** @returns {Storage | undefined} */
function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** @param {{ children: import('react').ReactNode }} props */
export function ThemeProvider({ children }) {
  const [choice, setChoiceState] = useState(() => readThemeChoice(safeStorage()));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    /** @param {MediaQueryListEvent} event */
    const onChange = (event) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(choice, systemDark);

  useEffect(() => {
    applyTheme(document, resolved, choice);
  }, [resolved, choice]);

  const setChoice = useCallback((/** @type {ThemeChoice} */ next) => {
    saveThemeChoice(safeStorage(), next);
    setChoiceState(next);
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** @returns {ThemeContextValue} */
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
