import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

/** @param {import('react').ComponentProps<typeof LabelPrimitive.Root>} props */
export function Label({ className, ...props }) {
  return <LabelPrimitive.Root data-slot="label" className={cn('text-label text-ink', className)} {...props} />;
}
