import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider.jsx';
import { cn } from '@/lib/utils.js';

const OPTIONS = /** @type {const} */ ([
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]);

/**
 * Light, Dark and System segmented control (DESIGN.md 6). System is the default.
 * @param {{ compact?: boolean, className?: string }} props compact shows icons only (names stay accessible)
 */
export function ThemeSwitch({ compact = false, className }) {
  const { choice, setChoice } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('flex bg-fill p-1', compact ? 'flex-col items-center gap-1 rounded-lg' : 'gap-1 rounded-full', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={compact ? label : undefined}
            onClick={() => setChoice(value)}
            className={cn(
              'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-label text-ink-secondary',
              compact ? 'w-11 flex-none' : 'flex-1',
              'transition-colors duration-fast ease-standard hover:text-ink focus-visible:focus-ring',
              selected && 'bg-card text-ink',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {compact ? null : <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
