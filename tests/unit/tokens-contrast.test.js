// DESIGN.md 5.4: recompute every contrast pair from src/styles/tokens.css and fail the build if any
// pair drops below its WCAG 2.1 AA threshold (4.5:1 for text, 3:1 for borders and chart bars).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/tokens.css', 'utf8');

/**
 * @param {string} selector ':root' or '.dark'
 * @returns {Record<string, string>} custom property values (hex only)
 */
function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  /** @type {Record<string, string>} */
  const out = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) out[name] = value.toLowerCase();
  return out;
}

const light = tokens(':root');
const dark = { ...light, ...tokens('.dark') };

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} a @param {string} b */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** @type {Array<[label: string, fg: string, bg: string, min: number]>} */
const PAIRS = [
  ['text-primary on page', 'text-primary', 'page', 4.5],
  ['text-primary on card', 'text-primary', 'card', 4.5],
  ['text-secondary on page', 'text-secondary', 'page', 4.5],
  ['text-secondary on card', 'text-secondary', 'card', 4.5],
  ['text-secondary on fill', 'text-secondary', 'fill', 4.5],
  ['text-tertiary on page', 'text-tertiary', 'page', 4.5],
  ['text-tertiary on card', 'text-tertiary', 'card', 4.5],
  ['link on card', 'link', 'card', 4.5],
  ['link on page', 'link', 'page', 4.5],
  ['success text on card', 'success', 'card', 4.5],
  ['warning text on card', 'warning', 'card', 4.5],
  ['error text on card', 'error', 'card', 4.5],
  ['form border on card', 'control-border', 'card', 3],
  ['chart bar on card', 'chart-bar', 'card', 3],
  ['on-primary on primary button', 'on-primary', 'primary', 4.5],
  ['on-error on destructive button', 'on-error', 'error', 4.5],
  ['focus ring on page', 'focus-ring', 'page', 3],
  ['text-primary on sidebar', 'text-primary', 'sidebar', 4.5],
  // ADR-006 audio waveform: graphics, so 3:1 against the card
  ['waveform played bars on card', 'wave-played', 'card', 3],
  ['waveform unplayed bars on card', 'wave-unplayed', 'card', 3],
  ['waveform playhead on card', 'wave-playhead', 'card', 3],
  ['recording waveform on card', 'wave-recording', 'card', 3],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast (DESIGN.md 5.4)', (_theme, t) => {
  it.each(PAIRS)('%s', (_label, fg, bg, min) => {
    expect(t[fg], `token --${fg}`).toMatch(/^#[0-9a-f]{6}$/);
    expect(t[bg], `token --${bg}`).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});

/** @param {string} fg @param {string} bg @param {number} p share of fg */
function mix(fg, bg, p) {
  return `#${[1, 3, 5]
    .map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * p + parseInt(bg.slice(i, i + 2), 16) * (1 - p)).toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('active navigation capsule (DESIGN.md 12.4)', () => {
  const tint = Number(/--capsule-tint:\s*(\d+)%/.exec(css)?.[1]) / 100;
  it.each([
    ['light', light],
    ['dark', dark],
  ])('%s: the link-coloured active label reaches 4.5:1 on the capsule', (_t, t) => {
    // bg-active-capsule mixes the link colour over --card (src/styles/index.css).
    expect(tint).toBeGreaterThan(0);
    expect(contrast(t.link, mix(t.link, t.card, tint))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('token values match DESIGN.md 5.2', () => {
  it('uses the confirmed brand palette (O4)', () => {
    expect(light.primary).toBe('#2563eb');
    expect(light['text-primary']).toBe('#0f172a');
    expect(light.success).toBe('#0f766e');
    expect(light.warning).toBe('#b45309');
    expect(light['warning-fill']).toBe('#d97706');
    expect(light.error).toBe('#dc2626');
    expect(light.fill).toBe('#f1f5f9');
  });
  it('defines the dark theme separately', () => {
    expect(dark.page).toBe('#0a1428');
    expect(dark.card).toBe('#0f1d3a');
    expect(dark.link).toBe('#60a5fa');
    expect(dark['text-primary']).toBe('#f1f5f9');
  });
  it('paints the logo navy on light and white on dark (D39)', () => {
    expect(light.logo).toBe('#0f172a');
    expect(dark.logo).toBe('#ffffff');
  });
  it('matches the ratios published in DESIGN.md 5.4 to one decimal', () => {
    expect(contrast(light['text-primary'], light.card)).toBeCloseTo(17.9, 1);
    expect(contrast(light['on-primary'], light.primary)).toBeCloseTo(5.2, 1);
    expect(contrast(dark['text-primary'], dark.card)).toBeCloseTo(15.2, 0);
  });
});
