import { UserRound } from 'lucide-react';
import { useState } from 'react';
import { fullName, getInitials } from '@/lib/initials.js';
import { cn } from '@/lib/utils.js';

// UserAvatar (BUILD_PLAN Phase 1, DESIGN.md 11): uploaded image, then initials (first letter of
// first and second name, uppercase), then a generic icon. A grey circle shows until the image
// loads; if the image fails to load, initials are shown instead. Initials are never stored.

const SIZES = Object.freeze({
  24: { box: 'size-6', text: 'text-caption', icon: 'size-4' },
  32: { box: 'size-8', text: 'text-caption', icon: 'size-5' },
  40: { box: 'size-10', text: 'text-label', icon: 'size-5' },
  56: { box: 'size-14', text: 'text-headline', icon: 'size-7' },
  96: { box: 'size-24', text: 'text-title-1', icon: 'size-12' },
});

/**
 * @typedef {object} UserAvatarProps
 * @property {string | null} [firstName]
 * @property {string | null} [secondName]
 * @property {string | null} [imageUrl] a signed URL for a VALIDATED profile image (Phase 4)
 * @property {24 | 32 | 40 | 56 | 96} [size]
 * @property {boolean} [decorative] true when the person's name is already shown next to the avatar
 * @property {string} [className]
 */

/** @param {UserAvatarProps} props */
export function UserAvatar({ firstName, secondName, imageUrl, size = 40, decorative = false, className }) {
  // Results are keyed by URL, so a new image starts from 'loading' without an effect.
  const [result, setResult] = useState(/** @type {{ url: string, outcome: 'loaded' | 'failed' } | null} */ (null));
  const status = result && result.url === imageUrl ? result.outcome : 'loading';

  const initials = getInitials(firstName, secondName);
  const name = fullName(firstName, secondName);
  const dims = SIZES[size];
  const showImage = Boolean(imageUrl) && status !== 'failed';
  const label = name || 'User';

  return (
    <span
      data-slot="user-avatar"
      data-state={showImage ? (status === 'loaded' ? 'image' : 'loading') : initials ? 'initials' : 'icon'}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-fill text-ink',
        dims.box,
        showImage && status === 'loading' && 'skeleton-shimmer',
        className,
      )}
    >
      {showImage ? (
        <img
          src={imageUrl ?? undefined}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onLoad={() => setResult({ url: imageUrl ?? '', outcome: 'loaded' })}
          onError={() => setResult({ url: imageUrl ?? '', outcome: 'failed' })}
          className={cn('size-full object-cover', status !== 'loaded' && 'opacity-0')}
        />
      ) : initials ? (
        <span aria-hidden="true" className={cn('font-semibold', dims.text)}>
          {initials}
        </span>
      ) : (
        <UserRound aria-hidden="true" className={cn('text-ink-secondary', dims.icon)} strokeWidth={1.75} />
      )}
    </span>
  );
}
