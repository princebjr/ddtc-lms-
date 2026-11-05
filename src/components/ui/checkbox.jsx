import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

// DESIGN.md 11: 24 px control, control-border outline, primary when on, 44 px hit area.
// The button itself is the 44 px target; the 24 px box inside is the visual control.
/** @param {import('react').ComponentProps<typeof CheckboxPrimitive.Root>} props */
export function Checkbox({ className, ...props }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group -m-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-6 items-center justify-center rounded-xs border border-control bg-card text-on-primary group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary"
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
          <Check className="size-4" />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}
