import { Link } from 'react-router';
import { InsetList } from '@/components/ui/inset-list.jsx';
import { PageHeader } from '@/components/layout/PageHeader.jsx';
import { NAVIGATION, ROLE_KEYS } from '@/lib/navigation.js';

// Preview index (development, CI and Vercel preview builds only). Lists the design page and every
// role shell destination so reviewers and the end-to-end tests can reach them before sign-in exists.

export default function DevIndexPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-content px-4 py-8 pt-safe pb-safe sm:px-6 lg:px-8">
      <PageHeader title="Preview pages" description="Not part of production builds. Role shells are mounted under real, guarded routes in Phase 3." />
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-title-2 text-ink">Design system</h2>
          <InsetList>
            <li>
              <Link to="/dev/design" className="flex min-h-14 items-center px-4 text-body text-link hover:bg-fill focus-visible:focus-ring">
                Components in light and dark
              </Link>
            </li>
          </InsetList>
        </section>
        {ROLE_KEYS.map((role) => (
          <section key={role} className="flex flex-col gap-2">
            <h2 className="m-0 text-title-2 text-ink">{NAVIGATION[role].roleLabel} shell</h2>
            <InsetList>
              {NAVIGATION[role].destinations.map((d) => (
                <li key={d.slug}>
                  <Link
                    to={`/dev/shell/${role}/${d.slug}`}
                    className="flex min-h-14 items-center gap-3 px-4 text-body text-link hover:bg-fill focus-visible:focus-ring"
                  >
                    <d.icon className="size-5 text-ink-secondary" aria-hidden="true" />
                    {d.label}
                  </Link>
                </li>
              ))}
            </InsetList>
          </section>
        ))}
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-title-2 text-ink">Fallback pages</h2>
          <InsetList>
            <li>
              <Link to="/offline" className="flex min-h-14 items-center px-4 text-body text-link hover:bg-fill focus-visible:focus-ring">
                Offline fallback
              </Link>
            </li>
          </InsetList>
        </section>
      </div>
    </main>
  );
}
