import { Ellipsis, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Sheet, SheetContent } from '@/components/ui/sheet.jsx';
import { activePillItem, findDestination, moreSheetDestinations, NAVIGATION } from '@/lib/navigation.js';
import { cn } from '@/lib/utils.js';

/** @typedef {import('@/lib/navigation.js').RoleKey} RoleKey */

/**
 * One pill item (DESIGN.md 12.4): a 48 px round target with a 22 px icon; the active item expands
 * into a capsule and shows its name beside the icon, with a 320 ms morph on the sheet curve.
 * @param {{ active: boolean, label: string, icon: import('lucide-react').LucideIcon }} props
 */
function PillItemContent({ active, label, icon: Icon }) {
  return (
    <span
      className={cn(
        'inline-flex h-12 items-center justify-center rounded-full px-3.5',
        'transition-[background-color,color,padding] duration-sheet ease-sheet',
        active ? 'bg-active-capsule text-link' : 'text-ink-secondary',
      )}
    >
      <Icon className="size-5.5 shrink-0 transition-transform duration-fast ease-standard group-active:scale-108" aria-hidden="true" strokeWidth={1.75} />
      <span
        className={cn(
          'overflow-hidden text-label font-semibold whitespace-nowrap',
          'transition-[max-width,opacity,margin] duration-sheet ease-sheet',
          active ? 'ml-2 max-w-32 opacity-100' : 'ml-0 max-w-0 opacity-0',
        )}
        aria-hidden={!active}
      >
        {label}
      </span>
    </span>
  );
}

const itemClass = 'group inline-flex min-h-12 min-w-12 items-center justify-center rounded-full focus-visible:focus-ring';

/**
 * Floating pill bar for phones (below 640 px): three destinations plus a permanent More button
 * that opens a bottom sheet with every other destination and Sign out (D40).
 * @param {{ role: RoleKey, basePath: string, currentSlug: string, onSignOut: () => void }} props
 */
export function PhoneNav({ role, basePath, currentSlug, onSignOut }) {
  const nav = NAVIGATION[role];
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeItem = sheetOpen ? 'more' : activePillItem(role, currentSlug);

  return (
    <>
      <nav
        aria-label="Main"
        data-slot="phone-nav"
        className={cn(
          'fixed inset-x-4 bottom-pill z-40 mx-auto flex h-16 max-w-md items-center justify-between gap-1 px-2 sm:hidden',
          'rounded-full border border-hairline bg-pill shadow-overlay blur-material',
        )}
      >
        {nav.pill.map((slug) => {
          const dest = findDestination(role, slug);
          if (!dest) return null;
          const active = activeItem === slug;
          return (
            <Link
              key={slug}
              to={`${basePath}/${slug}`}
              className={itemClass}
              aria-label={dest.label}
              aria-current={currentSlug === slug ? 'page' : undefined}
              data-active={active || undefined}
            >
              <PillItemContent active={active} label={dest.label} icon={dest.icon} />
            </Link>
          );
        })}
        <button
          type="button"
          className={itemClass}
          aria-label="More"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          data-active={activeItem === 'more' || undefined}
          onClick={() => setSheetOpen(true)}
        >
          <PillItemContent active={activeItem === 'more'} label="More" icon={Ellipsis} />
        </button>
      </nav>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent title="More" description="Every other destination and Sign out">
          <ul className="m-0 flex list-none flex-col p-0">
            {moreSheetDestinations(role).map((dest) => (
              <li key={dest.slug}>
                <Link
                  to={`${basePath}/${dest.slug}`}
                  onClick={() => setSheetOpen(false)}
                  aria-current={currentSlug === dest.slug ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 items-center gap-4 rounded-md px-3 text-body text-ink hover:bg-fill focus-visible:focus-ring',
                    currentSlug === dest.slug && 'bg-active-capsule text-link',
                  )}
                >
                  <dest.icon className="size-6 shrink-0 text-ink-secondary" aria-hidden="true" strokeWidth={1.75} />
                  {dest.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-hairline pt-2">
              <button
                type="button"
                onClick={() => {
                  setSheetOpen(false);
                  onSignOut();
                }}
                className="flex min-h-14 w-full items-center gap-4 rounded-md px-3 text-left text-body text-ink hover:bg-fill focus-visible:focus-ring"
              >
                <LogOut className="size-6 shrink-0 text-ink-secondary" aria-hidden="true" strokeWidth={1.75} />
                Sign out
              </button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
