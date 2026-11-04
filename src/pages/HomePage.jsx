import { Link } from 'react-router';
import { LogoMark } from '@/components/brand/LogoMark.jsx';
import { devRoutesEnabled } from '@/lib/flags.js';

// Public holding page until Sign In arrives in Phase 3: the auth hero (DESIGN.md 4 and 21) with
// the DDTC emblem, the full name and the tagline.

export const INSTITUTION_NAME = 'DYNAMIC DISCIPLESHIP TRAINING CENTRE';
export const TAGLINE = 'Equipping believers for deeper discipleship and lifelong learning.';

export default function HomePage() {
  return (
    <div className="flex min-h-dvh-screen flex-col bg-hero-soft pt-safe pr-safe pb-safe pl-safe">
      <main id="main" className="mx-auto flex w-full max-w-reading flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <LogoMark logo="ddtc" size="hero-phone" className="sm:size-30" label="DDTC LMS logo" />
        <div className="flex flex-col gap-3">
          <p className="m-0 text-label tracking-wide text-ink-secondary">{INSTITUTION_NAME}</p>
          <h1 className="m-0 text-large-title text-ink lg:text-title-1">DDTC LMS</h1>
          <p className="m-0 text-body text-ink-secondary">{TAGLINE}</p>
        </div>
        <p className="m-0 rounded-md border border-hairline bg-card px-4 py-3 text-body-sm text-ink-secondary">
          The learning system is being prepared. Sign in opens soon.
        </p>
        {devRoutesEnabled ? (
          <Link to="/dev" className="inline-flex h-11 items-center rounded-full px-4 text-label text-link hover:bg-fill focus-visible:focus-ring">
            Open the preview pages
          </Link>
        ) : null}
      </main>
    </div>
  );
}
