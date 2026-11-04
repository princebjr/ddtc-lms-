import { cn } from '@/lib/utils.js';

// Card (DESIGN.md 11): card fill, 1 px hairline, 24 px radius, 16 to 24 px padding.

/** @param {import('react').HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' | 'li' }} props */
export function Card({ className, as: Tag = 'section', ...props }) {
  return <Tag data-slot="card" className={cn('rounded-lg border border-hairline bg-card p-4 text-ink sm:p-6', className)} {...props} />;
}

/** @param {import('react').ComponentProps<'h2'>} props */
export function CardTitle({ className, ...props }) {
  return <h2 className={cn('m-0 text-title-3 text-ink', className)} {...props} />;
}

/** @param {import('react').ComponentProps<'p'>} props */
export function CardDescription({ className, ...props }) {
  return <p className={cn('m-0 text-body-sm text-ink-secondary', className)} {...props} />;
}
