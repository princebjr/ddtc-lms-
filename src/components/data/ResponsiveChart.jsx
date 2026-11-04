import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils.js';

// ResponsiveChart wrapper (RESPONSIVE.md 15.2, DESIGN.md 13): full width on phones with shortened
// labels; a text summary is always visible below the chart. The chart library itself is chosen
// and lazy-loaded in Phase 10; this wrapper is library-agnostic and passes the measured width and
// a `compact` flag (below 640 px) to its render function.

export const COMPACT_CHART_WIDTH = 640;

/**
 * @param {{ title: string, summary: string, height?: 'sm' | 'md' | 'lg',
 *   children: (size: { width: number, compact: boolean }) => import('react').ReactNode, className?: string }} props
 */
export function ResponsiveChart({ title, summary, height = 'md', children, className }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <figure data-slot="responsive-chart" className={cn('m-0 flex min-w-0 flex-col gap-3', className)}>
      <div className="text-headline text-ink">{title}</div>
      <div
        ref={ref}
        className={cn('w-full min-w-0 overflow-hidden', height === 'sm' && 'h-40', height === 'md' && 'h-56', height === 'lg' && 'h-72')}
        aria-hidden="true"
      >
        {width > 0 ? children({ width, compact: width < COMPACT_CHART_WIDTH }) : null}
      </div>
      <figcaption className="text-body-sm text-ink-secondary">{summary}</figcaption>
    </figure>
  );
}
