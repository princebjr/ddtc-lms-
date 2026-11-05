import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

/** @param {import('react').ComponentProps<typeof RadioGroupPrimitive.Root>} props */
export function RadioGroup({ className, ...props }) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn('grid gap-2', className)} {...props} />;
}

// The item is the 44 px target; the 24 px circle inside is the visual control.
/** @param {import('react').ComponentProps<typeof RadioGroupPrimitive.Item>} props */
export function RadioGroupItem({ className, ...props }) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'group -m-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-6 items-center justify-center rounded-full border border-control bg-card group-data-[state=checked]:border-primary"
      >
        <RadioGroupPrimitive.Indicator className="size-3 rounded-full bg-primary" />
      </span>
    </RadioGroupPrimitive.Item>
  );
}
