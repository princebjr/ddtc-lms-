import { LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { useTheme } from '@/components/theme/ThemeProvider.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';
import { UserAvatar } from '@/components/UserAvatar.jsx';
import { getInitials } from '@/lib/initials.js';
import { isThemeChoice } from '@/lib/theme.js';

/** @typedef {{ firstName: string, secondName: string, imageUrl?: string | null }} ShellUser */

/**
 * Avatar menu in the top bar: name and role, Profile, theme, Sign out.
 * @param {{ user: ShellUser, roleLabel: string, profileHref: string, onSignOut: () => void }} props
 */
export function AccountMenu({ user, roleLabel, profileHref, onSignOut }) {
  const { choice, setChoice } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-11 items-center justify-center rounded-full focus-visible:focus-ring"
        // WCAG 2.5.3: the visible initials are part of the accessible name.
        aria-label={`${getInitials(user.firstName, user.secondName) || 'Account'}: account menu for ${user.firstName} ${user.secondName}`}
      >
        <UserAvatar firstName={user.firstName} secondName={user.secondName} imageUrl={user.imageUrl} size={32} decorative />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex items-center gap-3">
          <UserAvatar firstName={user.firstName} secondName={user.secondName} imageUrl={user.imageUrl} size={40} decorative />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body text-ink">
              {user.firstName} {user.secondName}
            </span>
            <span className="text-caption text-ink-secondary">{roleLabel}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={profileHref}>
            <UserRound aria-hidden="true" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(value) => isThemeChoice(value) && setChoice(value)}>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden="true" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden="true" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden="true" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
