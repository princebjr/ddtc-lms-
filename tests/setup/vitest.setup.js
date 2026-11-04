// Vitest setup: jest-dom matchers, DOM cleanup, and browser APIs jsdom lacks (matchMedia).
import { afterEach, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());

  if (!window.matchMedia) {
    /** Media queries match by default only for `(min-width: Npx)` up to the jsdom width. */
    window.matchMedia = (query) => {
      const min = /\(min-width:\s*(\d+)px\)/.exec(query);
      const matches = min ? window.innerWidth >= Number(min[1]) : false;
      return /** @type {MediaQueryList} */ ({
        matches,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      });
    };
  }
}
