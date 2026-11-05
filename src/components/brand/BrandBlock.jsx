import { LogoMark } from './LogoMark.jsx';

/** The exact brand line (CLAUDE.md, D39). No other wording is allowed. */
export const BRAND_LINE = 'from gölarae';

/**
 * Brand block: sits directly below the whole Sign In and Sign Up form (including the Google
 * button), centred: the gölarae logo (36 px tall), then directly beneath it the text
 * "from gölarae" (13 px, weight 500, text-secondary), with nothing between them.
 */
export function BrandBlock() {
  return (
    <div data-slot="brand-block" className="flex flex-col items-center gap-1 text-center">
      <LogoMark logo="golarae" size="brand" />
      <p className="m-0 text-brand-line text-ink-secondary">{BRAND_LINE}</p>
    </div>
  );
}
