import ddtc128 from '@/assets/brand/derived/logo-ddtc-128.webp';
import ddtc384 from '@/assets/brand/derived/logo-ddtc-384.webp';
import golarae128 from '@/assets/brand/derived/logo-golarae-128.webp';
import { cn } from '@/lib/utils.js';

// One LogoMark renders every logo through its alpha channel as a CSS mask over the `logo` token:
// navy #0F172A on light surfaces, white on dark (DESIGN.md 4, D39). Logos are never stretched,
// rotated, outlined, given effects or recoloured outside navy or white.

/** Sizes in DESIGN.md 4. Minimums: 32 px for the DDTC emblem, 28 px for the gölarae logo. */
const SIZES = Object.freeze({
  nav: 'size-8', // 32 px: sidebar and top bar
  brand: 'size-9', // 36 px tall: brand block
  'hero-phone': 'size-18', // 72 px: auth hero on phones
  hero: 'size-30', // 120 px: auth hero
});

const SOURCES = Object.freeze({
  ddtc: { small: ddtc128, large: ddtc384, label: 'DDTC LMS logo' },
  golarae: { small: golarae128, large: golarae128, label: 'gölarae logo' },
});

/** @typedef {keyof typeof SIZES} LogoSize */

/**
 * @param {{ logo: 'ddtc' | 'golarae', size?: LogoSize, tone?: 'auto' | 'navy' | 'white', label?: string | null, className?: string }} props
 *   label: accessible name; pass null when the logo is decorative (text beside it names it)
 */
export function LogoMark({ logo, size = 'nav', tone = 'auto', label, className }) {
  const source = SOURCES[logo];
  const large = size === 'hero' || size === 'hero-phone';
  const url = `url("${large ? source.large : source.small}")`;
  const name = label === undefined ? source.label : label;
  return (
    <span
      data-slot="logo-mark"
      data-logo={logo}
      role={name ? 'img' : undefined}
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
      className={cn(
        'inline-block shrink-0',
        SIZES[size],
        tone === 'auto' && 'bg-logo',
        tone === 'navy' && 'bg-logo-navy',
        tone === 'white' && 'bg-logo-white',
        className,
      )}
      style={{
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  );
}
