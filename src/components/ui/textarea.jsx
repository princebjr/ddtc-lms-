import { cn } from '@/lib/utils.js';
import { fieldChrome } from './input.jsx';

/** @param {import('react').ComponentProps<'textarea'>} props */
export function Textarea({ className, ...props }) {
  return <textarea data-slot="textarea" className={cn(fieldChrome, 'min-h-32 py-3', className)} {...props} />;
}
