import { BrandBlock } from '@/components/brand/BrandBlock.jsx';
import { LogoMark } from '@/components/brand/LogoMark.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { cn } from '@/lib/utils.js';

// Authentication layout (prototype `auth()`, DESIGN.md 4 and 21, RESPONSIVE.md 15). Desktop: the
// hero (DDTC emblem, the institution's name and tagline) beside the form. Phones and tablets: a
// compact hero above a single column. The DDTC LMS logo sits above the form. On Sign In and Sign Up
// the brand block (gölarae logo, then "from gölarae") sits directly below the whole form, Google
// button included (D39).

export const INSTITUTION_NAME = 'DYNAMIC DISCIPLESHIP TRAINING CENTRE';
export const TAGLINE = "Be faithful, even to the point of death, and I will give you life as your victor's crown - Revelation 2:10b.";

/**
 * @param {{ title: string, description?: import('react').ReactNode, children: import('react').ReactNode,
 *   footer?: import('react').ReactNode, brand?: boolean }} props
 *   brand: show the brand block (Sign In and Sign Up only)
 */
export function AuthLayout({ title, description, children, footer, brand = false }) {
  return (
    <div className="grid min-h-dvh-screen grid-cols-1 bg-page pt-safe pr-safe pb-safe pl-safe lg:grid-cols-2">
      <AuthHero />
      <main id="main" className="flex min-w-0 flex-col items-center justify-center px-4 pt-2 pb-10 lg:bg-card lg:px-16 lg:py-12">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <section aria-labelledby="auth-title" className="flex flex-col gap-6 rounded-lg border border-hairline bg-card p-6 lg:border-0 lg:p-0">
            <header className="flex flex-col gap-1">
              <h1 id="auth-title" className="m-0 text-title-1 text-ink">
                {title}
              </h1>
              {description ? <p className="m-0 text-body text-ink-secondary">{description}</p> : null}
            </header>
            {children}
            {footer}
          </section>
          {brand ? <BrandBlock /> : null}
        </div>
      </main>
    </div>
  );
}

function AuthHero() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 pt-8 pb-2 text-center lg:gap-4 lg:bg-hero-soft lg:p-10">
      <LogoMark logo="ddtc" size="hero-phone" className="lg:size-30" label="DDTC LMS logo" />
      <p className="m-0 text-label tracking-wide text-ink lg:text-title-3">{INSTITUTION_NAME}</p>
      <p className="m-0 hidden max-w-reading text-body text-ink-secondary lg:block">{TAGLINE}</p>
    </div>
  );
}

/**
 * The Authentication Loading State (UI_FEEDBACK.md): the auth layout with field and button
 * blocks while the session is checked. The brand line stays visible.
 * @param {{ fields?: number, brand?: boolean }} props
 */
export function AuthSkeleton({ fields = 2, brand = true }) {
  return (
    <div className="grid min-h-dvh-screen grid-cols-1 bg-page pt-safe pr-safe pb-safe pl-safe lg:grid-cols-2" aria-busy="true" data-slot="auth-skeleton">
      <AuthHero />
      <div className="flex min-w-0 flex-col items-center justify-center px-4 pt-2 pb-10 lg:bg-card lg:px-16 lg:py-12">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-6 rounded-lg border border-hairline bg-card p-6 lg:border-0 lg:p-0">
            <span className="sr-only" role="status">
              Checking your session
            </span>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-5 w-full" />
            </div>
            {Array.from({ length: fields }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
          {brand ? <BrandBlock /> : null}
        </div>
      </div>
    </div>
  );
}

/** "or" divider between the main button and Continue with Google (D27). */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-body-sm text-ink-tertiary" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
      <span aria-hidden="true">or</span>
      <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
    </div>
  );
}

/**
 * Form-level message (role=alert so screen readers announce it).
 * @param {{ tone?: 'error' | 'success', children: import('react').ReactNode }} props
 */
export function FormMessage({ tone = 'error', children }) {
  if (!children) return null;
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={cn('m-0 text-body-sm', tone === 'error' ? 'text-error' : 'text-success')}>
      {children}
    </p>
  );
}
