import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useDelayedLoading } from '@/hooks/use-delayed-loading.js';
import { ErrorState } from './States.jsx';

// Shared skeletons (UI_FEEDBACK.md skeleton table). Each matches its final layout so content does
// not shift when it arrives. Repeat counts never exceed one screen.

/**
 * Loading region: applies the 150 ms / 300 ms / 10 s rules and the accessibility contract
 * (aria-busy and a visually hidden "Loading" label).
 * @param {{ loading: boolean, skeleton: import('react').ReactNode, children: import('react').ReactNode, onRetry?: () => void, label?: string }} props
 */
export function LoadingRegion({ loading, skeleton, children, onRetry, label = 'Loading' }) {
  const phase = useDelayedLoading(loading);
  if (phase === 'timeout') return <ErrorState title="This is taking too long" description="The page did not load in time. Check your connection and try again." onRetry={onRetry} />;
  if (phase === 'content') return <>{children}</>;
  return (
    <div aria-busy="true" data-loading-phase={phase}>
      <span className="sr-only" role="status">
        {label}
      </span>
      {phase === 'skeleton' ? skeleton : <div className="invisible" aria-hidden="true">{skeleton}</div>}
    </div>
  );
}

/** Dashboards (all roles): a row of summary-card blocks and 3 list-row blocks. */
export function DashboardSkeleton() {
  return (
    <div data-skeleton="dashboard" className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4 sm:p-6">
            <Skeleton className="w-1/2" />
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="w-2/3" />
          </div>
        ))}
      </div>
      <div className="flex flex-col divide-y divide-hairline rounded-md border border-hairline bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-2">
            <Skeleton shape="circle" className="size-10" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Lists and tables: header and rows on wide screens; stacked card blocks with an avatar circle on phones.
 * @param {{ rows?: number, columns?: number }} props
 */
export function ListSkeleton({ rows = 6, columns = 4 }) {
  const list = Array.from({ length: rows }, (_, i) => i);
  const cols = Array.from({ length: columns }, (_, i) => i);
  return (
    <div data-skeleton="list">
      <div className="flex flex-col gap-3 sm:hidden">
        {list.map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border border-hairline bg-card p-4">
            <Skeleton shape="circle" className="size-10" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton shape="chip" />
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-md border border-hairline bg-card sm:block">
        <div className="flex h-12 items-center gap-4 bg-fill px-4">
          {cols.map((c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
        </div>
        {list.map((i) => (
          <div key={i} className="flex h-12 items-center gap-4 border-t border-hairline px-4">
            {cols.map((c) => (
              <Skeleton key={c} className="flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Profile and settings forms: avatar circle, label and input blocks. */
export function FormSkeleton({ fields = 4 }) {
  return (
    <div data-skeleton="form" className="flex flex-col gap-5 rounded-lg border border-hairline bg-card p-4 sm:p-6">
      <Skeleton shape="circle" className="size-24" />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton shape="field" />
        </div>
      ))}
      <Skeleton shape="button" className="w-32" />
    </div>
  );
}

/** Charts: frame with six grey bars and axis lines, plus a text-summary line. */
export function ChartSkeleton() {
  const heights = ['h-1/4', 'h-2/5', 'h-3/5', 'h-4/5', 'h-1/2', 'h-1/3'];
  return (
    <div data-skeleton="chart" className="flex flex-col gap-3">
      <div className="flex h-48 items-end gap-3 border-b border-l border-hairline px-3 pb-0">
        {heights.map((h) => (
          <Skeleton key={h} className={`${h} flex-1 rounded-b-none`} />
        ))}
      </div>
      <Skeleton className="w-3/4" />
    </div>
  );
}

/** Course cards (My Courses): cover block, title and code lines, a chip. */
export function CourseCardsSkeleton({ cards = 6 }) {
  return (
    <div data-skeleton="course-cards" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-lg border border-hairline bg-card">
          <Skeleton className="aspect-video h-auto w-full rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="w-3/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton shape="chip" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Course workspace: course title bar, tab bar blocks, then the active tab's skeleton (UI_FEEDBACK). */
export function CourseWorkspaceSkeleton() {
  return (
    <div data-skeleton="course-workspace" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} shape="chip" className="h-11 w-24 shrink-0" />
        ))}
      </div>
      <FormSkeleton fields={3} />
    </div>
  );
}
