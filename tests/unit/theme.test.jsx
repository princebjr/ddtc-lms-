// @vitest-environment jsdom
// DESIGN.md 6: Light, Dark and System (default System); stored in the browser with guarded access;
// applied before first paint by the inline script in index.html; theme-color follows the theme.
import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '@/components/theme/ThemeProvider.jsx';
import { applyTheme, readThemeChoice, resolveTheme, saveThemeChoice, THEME_COLORS, THEME_STORAGE_KEY } from '@/lib/theme.js';

describe('theme rules', () => {
  it('defaults to System when nothing is stored or storage throws', () => {
    expect(readThemeChoice(undefined)).toBe('system');
    expect(readThemeChoice({ getItem: () => null })).toBe('system');
    expect(readThemeChoice({ getItem: () => 'purple' })).toBe('system');
    expect(
      readThemeChoice({
        getItem: () => {
          throw new Error('SecurityError');
        },
      }),
    ).toBe('system');
  });

  it('reads a saved choice', () => expect(readThemeChoice({ getItem: () => 'dark' })).toBe('dark'));

  it('saving never throws', () => {
    expect(
      saveThemeChoice(
        {
          setItem: () => {
            throw new Error('QuotaExceeded');
          },
        },
        'dark',
      ),
    ).toBe(false);
  });

  it('System follows the device setting', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('applies the .dark class, color-scheme and theme-color', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
    applyTheme(document, 'dark', 'system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(THEME_COLORS.dark);
    applyTheme(document, 'light', 'light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(THEME_COLORS.light);
  });
});

describe('no flash of the wrong theme', () => {
  const html = readFileSync('index.html', 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

  it('index.html applies the theme in an inline script before the app bundle loads', () => {
    expect(script).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('src="/src/main.jsx"'));
    expect(script).toContain(THEME_COLORS.dark);
    expect(script).toContain(THEME_COLORS.light);
  });

  it.each([
    ['dark', false, true],
    ['light', true, false],
    ['system', true, true],
    ['system', false, false],
    [null, true, true],
  ])('stored %s with system dark=%s gives dark=%s', (stored, systemDark, expectDark) => {
    document.documentElement.className = '';
    document.head.innerHTML = '<meta name="theme-color" content="" />';
    const storage = { getItem: () => stored };
    const fakeWindow = { localStorage: storage, matchMedia: () => ({ matches: systemDark }) };
    new Function('window', 'document', script)(fakeWindow, document);
    expect(document.documentElement.classList.contains('dark')).toBe(expectDark);
  });

  it('the inline script survives storage that throws', () => {
    const fakeWindow = {
      get localStorage() {
        throw new Error('SecurityError');
      },
      matchMedia: () => ({ matches: false }),
    };
    expect(() => new Function('window', 'document', script)(fakeWindow, document)).not.toThrow();
  });
});

function Probe() {
  const { choice, resolved, setChoice } = useTheme();
  return (
    <>
      <span data-testid="state">{`${choice}:${resolved}`}</span>
      <button type="button" onClick={() => setChoice('dark')}>
        dark
      </button>
    </>
  );
}

describe('ThemeProvider', () => {
  it('switches theme and stores the choice', () => {
    window.localStorage.clear();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('system:light');
    act(() => screen.getByRole('button', { name: 'dark' }).click());
    expect(screen.getByTestId('state')).toHaveTextContent('dark:dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
