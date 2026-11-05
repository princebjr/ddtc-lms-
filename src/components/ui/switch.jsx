import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

// The switch button is the 44 px tall target; the 28 px track inside is the visual control.
/** @param {import('react').ComponentProps<typeof SwitchPrimitive.Root>} props */
export function Switch({ className, ...props }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'group -my-2 inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-7 w-12 items-center rounded-full border border-control bg-fill p-0.5',
          'transition-colors duration-base ease-standard group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary',
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none block size-6 rounded-full bg-card shadow-overlay',
            'transition-transform duration-base ease-standard data-[state=checked]:translate-x-5',
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  );
}
