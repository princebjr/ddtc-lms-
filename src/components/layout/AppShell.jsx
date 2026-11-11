import { useState } from 'react';
import { LogoMark } from '@/components/brand/LogoMark.jsx';
import { NAVIGATION } from '@/lib/navigation.js';
import { cn } from '@/lib/utils.js';
import { AccountMenu } from './AccountMenu.jsx';
import { PhoneNav } from './PhoneNav.jsx';
import { SideNav } from './SideNav.jsx';

/** @typedef {import('@/lib/navigation.js').RoleKey} RoleKey */
/** @typedef {import('./AccountMenu.jsx').ShellUser} ShellUser */

const RAIL_KEY = 'ddtc-rail-collapsed';

/** @returns {boolean} */
function readRailCollapsed() {
  try {
    return window.localStorage.getItem(RAIL_KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * Role layout shell (BUILD_PLAN Phase 1, RESPONSIVE.md 15.1):
 * phones get a top bar (emblem, the institution's short name DDTC in bold, avatar menu; owner
 * change 2026-11-06: the page title is no longer repeated there) and the floating pill bar;
 * tablets a collapsible side rail; desktops a persistent sidebar. Content is capped at 1280 px.
 * Phase 3 mounts this shell under guarded routes; until then it is reachable only on preview routes.
 *
 * @param {{ role: RoleKey, basePath: string, currentSlug: string, user: ShellUser, onSignOut: () => void, bell?: import('react').ReactNode, children: import('react').ReactNode }} props
 */
export function AppShell({ role, basePath, currentSlug, user, onSignOut, bell = null, children }) {
  const [collapsed, setCollapsed] = useState(readRailCollapsed);
  const nav = NAVIGATION[role];

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(RAIL_KEY, next ? '1' : '0');
      } catch {
        // Storage unavailable: the choice lasts for this page view.
      }
      return next;
    });
  };

  return (
    <div data-app-shell={role} data-rail-collapsed={collapsed || undefined} className="min-h-dvh-screen bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-3 focus:text-label focus:text-ink focus:shadow-overlay"
      >
        Skip to content
      </a>

      <SideNav role={role} basePath={basePath} currentSlug={currentSlug} collapsed={collapsed} onToggle={toggle} />

      <div className={cn('flex min-h-dvh-screen min-w-0 flex-col', collapsed ? 'sm:pl-(--rail-width) lg:pl-(--sidebar-width)' : 'sm:pl-(--sidebar-width)')}>
        <header className="sticky top-0 z-20 border-b border-hairline bg-pill pt-safe blur-material">
          <div className="mx-auto flex h-14 max-w-content items-center gap-3 px-4 sm:px-6 lg:px-8">
            <span className="sm:hidden">
              <LogoMark logo="ddtc" size="nav" label="DDTC LMS" />
            </span>
            {/* The emblem already names DDTC LMS for screen readers, so the short name is hidden from them. */}
            <span className="min-w-0 flex-1 truncate text-headline font-bold tracking-wide text-ink sm:invisible" aria-hidden="true">
              DDTC
            </span>
            {bell}
            <AccountMenu user={user} roleLabel={nav.roleLabel} profileHref={`${basePath}/profile`} onSignOut={onSignOut} />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content min-w-0 flex-1 px-4 pt-6 pb-nav-safe outline-none sm:px-6 sm:pb-8 lg:px-8">
          {children}
        </main>
      </div>

      <PhoneNav role={role} basePath={basePath} currentSlug={currentSlug} onSignOut={onSignOut} />
    </div>
  );
}
