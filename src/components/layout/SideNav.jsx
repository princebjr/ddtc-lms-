import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Link } from 'react-router';
import { LogoMark } from '@/components/brand/LogoMark.jsx';
import { sidebarGroups } from '@/lib/navigation.js';
import { cn } from '@/lib/utils.js';
import { ThemeSwitch } from './ThemeSwitch.jsx';

/** @typedef {import('@/lib/navigation.js').RoleKey} RoleKey */

/**
 * Tablet (640 to 1023 px): collapsible side rail, icons only when collapsed.
 * Desktop (1024 px and up): persistent sidebar with the DDTC emblem and "DDTC LMS", grouped
 * destinations with a blue-tinted active item, and the theme switch at the bottom (DESIGN.md 11).
 * @param {{ role: RoleKey, basePath: string, currentSlug: string, collapsed: boolean, onToggle: () => void }} props
 */
export function SideNav({ role, basePath, currentSlug, collapsed, onToggle }) {
  const groups = sidebarGroups(role);
  return (
    <aside
      data-slot="side-nav"
      data-collapsed={collapsed || undefined}
      className={cn(
        'group/nav fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-hairline bg-sidebar pt-safe pb-safe pl-safe sm:flex',
        'transition-[width] duration-sheet ease-sheet',
        collapsed ? 'w-(--rail-width) lg:w-(--sidebar-width)' : 'w-(--sidebar-width)',
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 px-4">
        <LogoMark logo="ddtc" size="nav" label={null} />
        <span className={cn('text-headline whitespace-nowrap text-ink', collapsed && 'sr-only lg:not-sr-only')}>DDTC LMS</span>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {groups.map(({ group, items }) => (
          <div key={group} className="pt-4">
            <p className={cn('m-0 px-3 pb-1 text-caption tracking-wide text-ink-secondary uppercase', collapsed && 'sr-only lg:not-sr-only')}>{group}</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {items.map((dest) => {
                const active = currentSlug === dest.slug;
                return (
                  <li key={dest.slug}>
                    <Link
                      to={`${basePath}/${dest.slug}`}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? dest.label : undefined}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-full px-3 text-label whitespace-nowrap',
                        'transition-colors duration-fast ease-standard focus-visible:focus-ring',
                        active ? 'bg-active-capsule text-link' : 'text-ink hover:bg-fill',
                      )}
                    >
                      <dest.icon className={cn('size-5 shrink-0', active ? 'text-link' : 'text-ink-secondary')} aria-hidden="true" strokeWidth={1.75} />
                      <span className={cn(collapsed && 'sr-only lg:not-sr-only')}>{dest.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-2 border-t border-hairline p-3">
        <ThemeSwitch compact={collapsed} className={cn(collapsed && 'lg:hidden')} />
        {collapsed ? <ThemeSwitch className="hidden lg:flex" /> : null}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full text-label text-ink-secondary hover:bg-fill focus-visible:focus-ring lg:hidden"
        >
          {collapsed ? <PanelLeftOpen className="size-5" aria-hidden="true" /> : <PanelLeftClose className="size-5" aria-hidden="true" />}
          {collapsed ? null : <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
