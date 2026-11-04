import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

// Tabs and segmented control (DESIGN.md 11): fill track, selected pill on card; the list scrolls
// inside itself on phones (never the page).

export const Tabs = TabsPrimitive.Root;

/** @param {import('react').ComponentProps<typeof TabsPrimitive.List>} props */
export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('flex max-w-full gap-1 overflow-x-auto rounded-full bg-fill p-1 [scrollbar-width:none]', className)}
      {...props}
    />
  );
}

/** @param {import('react').ComponentProps<typeof TabsPrimitive.Trigger>} props */
export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-11 shrink-0 items-center justify-center rounded-full px-4 text-label text-ink-secondary',
        'transition-colors duration-fast ease-standard hover:text-ink focus-visible:focus-ring',
        'data-[state=active]:bg-card data-[state=active]:text-ink',
        className,
      )}
      {...props}
    />
  );
}

/** @param {import('react').ComponentProps<typeof TabsPrimitive.Content>} props */
export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('pt-4 outline-none', className)} {...props} />;
}
