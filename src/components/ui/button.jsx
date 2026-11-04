import { cva } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils.js';

// DESIGN.md 11: pill buttons, 44 px high (48 px on auth forms), label type, press scale 0.98,
// inline spinner while loading that keeps the button's width.
export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full text-label',
    'transition-[background-color,color,transform,opacity] duration-fast ease-standard active:scale-98',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:brightness-110',
        secondary: 'bg-fill text-ink hover:brightness-95 dark:hover:brightness-125',
        outline: 'border border-control bg-transparent text-ink hover:bg-fill',
        ghost: 'bg-transparent text-ink hover:bg-fill',
        destructive: 'bg-error text-on-error hover:brightness-110',
        link: 'bg-transparent text-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 min-w-11 px-5 [&_svg]:size-5',
        auth: 'h-12 w-full px-6 [&_svg]:size-5',
        icon: 'size-11 [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

/**
 * @typedef {object} ButtonOwnProps
 * @property {'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'} [variant]
 * @property {'default' | 'auth' | 'icon'} [size]
 * @property {boolean} [asChild] render the child element (for example a Link) with button styles
 * @property {boolean} [loading] request in flight: shows an inline spinner and disables the button
 * @property {string} [loadingLabel] accessible text while loading
 */

/** @param {ButtonOwnProps & import('react').ComponentProps<'button'>} props */
export function Button({ className, variant, size, asChild = false, loading = false, loadingLabel = 'Working', children, disabled, ...props }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          <span className={cn('inline-flex items-center justify-center gap-2', loading && 'invisible')}>{children}</span>
          {loading ? (
            <span className="absolute inset-0 inline-flex items-center justify-center">
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              <span className="sr-only">{loadingLabel}</span>
            </span>
          ) : null}
        </>
      )}
    </Comp>
  );
}
