import { Separator as SeparatorPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

/** @param {import('react').ComponentProps<typeof SeparatorPrimitive.Root>} props */
export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn('shrink-0 bg-hairline', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  );
}
