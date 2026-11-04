import { cn } from '@/lib/utils.js';

// Page header (DESIGN.md 11): large title on phones and tablets, title-1 on desktop, optional
// description, actions on the right on desktop (the desktop form of a screen's FAB action).

/**
 * @param {{ title: string, description?: string, actions?: import('react').ReactNode, className?: string }} props
 */
export function PageHeader({ title, description, actions, className }) {
  return (
    <header className={cn('flex flex-col gap-2 pb-6 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-large-title break-words text-ink lg:text-title-1">{title}</h1>
        {description ? <p className="m-0 text-body text-ink-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="hidden shrink-0 gap-2 lg:flex">{actions}</div> : null}
    </header>
  );
}
