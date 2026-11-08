import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { fieldChrome } from './input.jsx';

// A native drop-down styled like the other fields (DESIGN.md 11: 48 px high, 16 px text, the field
// border and focus ring), so that phones open their own picker (D42: pickers are native below
// 640 px). Set `data-placeholder` while nothing is chosen to show the value in placeholder colour.

/** @param {import('react').ComponentProps<'select'>} props */
export function NativeSelect({ className, children, ...props }) {
  return (
    <div className="relative">
      <select data-slot="native-select" className={cn(fieldChrome, 'h-12 appearance-none pr-12 data-[placeholder]:text-ink-tertiary', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-ink-secondary" aria-hidden="true" />
    </div>
  );
}
