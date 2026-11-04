import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

/** @param {import('react').ComponentProps<typeof SwitchPrimitive.Root>} props */
export function Switch({ className, ...props }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-control bg-fill p-0.5',
        "before:absolute before:-inset-2 before:content-['']",
        'transition-colors duration-base ease-standard data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-6 rounded-full bg-card shadow-overlay',
          'transition-transform duration-base ease-standard data-[state=checked]:translate-x-5',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
