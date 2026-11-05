// Theme logic (DESIGN.md 6): Light, Dark or System, stored in the browser (guarded), System by default.
// The inline script in index.html applies the same rules before first paint; keep both in step.

export const THEME_STORAGE_KEY = 'ddtc-theme';

/** @typedef {'light' | 'dark' | 'system'} ThemeChoice */

/** @type {readonly ThemeChoice[]} */
export const THEME_CHOICES = Object.freeze(['light', 'dark', 'system']);

/** Browser chrome colour per resolved theme (the `page` token). */
export const THEME_COLORS = Object.freeze({ light: '#f8fafc', dark: '#0a1428' });

/**
 * @param {unknown} value
 * @returns {value is ThemeChoice}
 */
export function isThemeChoice(value) {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Reads the saved choice. Storage can be missing or throw (private mode, blocked cookies).
 * @param {Pick<Storage, 'getItem'> | undefined} storage
 * @returns {ThemeChoice}
 */
export function readThemeChoice(storage) {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

/**
 * @param {Pick<Storage, 'setItem'> | undefined} storage
 * @param {ThemeChoice} choice
 * @returns {boolean} whether the choice was saved
 */
export function saveThemeChoice(storage, choice) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, choice);
    return Boolean(storage);
  } catch {
    return false;
  }
}

/**
 * @param {ThemeChoice} choice
 * @param {boolean} systemPrefersDark
 * @returns {'light' | 'dark'}
 */
export function resolveTheme(choice, systemPrefersDark) {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

/**
 * Applies a resolved theme to the document: `.dark` class, `color-scheme` and the theme-color meta.
 * @param {Document} doc
 * @param {'light' | 'dark'} resolved
 * @param {ThemeChoice} choice
 */
export function applyTheme(doc, resolved, choice) {
  const root = doc.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  root.setAttribute('data-theme-choice', choice);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
}
