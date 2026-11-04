import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

// DESIGN.md 11: 24 px control, control-border outline, primary when on, 44 px hit area.
/** @param {import('react').ComponentProps<typeof CheckboxPrimitive.Root>} props */
export function Checkbox({ className, ...props }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative inline-flex size-6 shrink-0 items-center justify-center rounded-xs border border-control bg-card text-on-primary',
        "before:absolute before:-inset-2.5 before:content-['']",
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-4" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
