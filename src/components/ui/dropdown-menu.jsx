import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils.js';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

/** @param {import('react').ComponentProps<typeof MenuPrimitive.Content>} props */
export function DropdownMenuContent({ className, sideOffset = 6, ...props }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          'z-50 min-w-56 overflow-hidden rounded-md border border-hairline bg-card p-1 text-ink shadow-overlay data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

const itemClass =
  'relative flex min-h-11 cursor-default select-none items-center gap-3 rounded-sm px-3 py-2 text-body outline-none data-[highlighted]:bg-fill data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-ink-secondary';

/** @param {import('react').ComponentProps<typeof MenuPrimitive.Item>} props */
export function DropdownMenuItem({ className, ...props }) {
  return <MenuPrimitive.Item data-slot="dropdown-menu-item" className={cn(itemClass, className)} {...props} />;
}

/** @param {import('react').ComponentProps<typeof MenuPrimitive.RadioItem>} props */
export function DropdownMenuRadioItem({ className, children, ...props }) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(itemClass, 'data-[state=checked]:text-link data-[state=checked]:[&_svg]:text-link', className)}
      {...props}
    >
      {children}
    </MenuPrimitive.RadioItem>
  );
}

/** @param {import('react').ComponentProps<typeof MenuPrimitive.Label>} props */
export function DropdownMenuLabel({ className, ...props }) {
  return <MenuPrimitive.Label className={cn('px-3 py-2 text-caption text-ink-secondary', className)} {...props} />;
}

/** @param {import('react').ComponentProps<typeof MenuPrimitive.Separator>} props */
export function DropdownMenuSeparator({ className, ...props }) {
  return <MenuPrimitive.Separator className={cn('my-1 h-px bg-hairline', className)} {...props} />;
}
