import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

/** @param {import('react').ComponentProps<typeof RadioGroupPrimitive.Root>} props */
export function RadioGroup({ className, ...props }) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn('grid gap-3', className)} {...props} />;
}

/** @param {import('react').ComponentProps<typeof RadioGroupPrimitive.Item>} props */
export function RadioGroupItem({ className, ...props }) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'relative inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-control bg-card',
        "before:absolute before:-inset-2.5 before:content-['']",
        'data-[state=checked]:border-primary focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-3 rounded-full bg-primary" />
    </RadioGroupPrimitive.Item>
  );
}
