import { Button } from '@/components/ui/button.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { useDelayedLoading } from '@/hooks/use-delayed-loading.js';

// Shared skeletons (UI_FEEDBACK.md skeleton table). Each matches its final layout so content does
// not shift when it arrives. Repeat counts never exceed one screen.

/**
 * Loading region: applies the 150 ms / 300 ms / 10 s rules and the accessibility contract
 * (aria-busy and a visually hidden "Loading" label).
 * @param {{ loading: boolean, skeleton: import('react').ReactNode, children: import('react').ReactNode, onRetry?: () => void, label?: string }} props
 */
export function LoadingRegion({ loading, skeleton, children, onRetry, label = 'Loading' }) {
  const phase = useDelayedLoading(loading);
  if (phase === 'content') return <>{children}</>;
  // After 10 seconds (owner decision of 2026-11-13, Phase 15, ADR-028): on a slow connection the page is usually
  // still on its way, so the skeleton stays and a calm notice with Retry appears beneath it; the page replaces
  // both when it arrives. A real failure reaches the page as its error state at once.
  const slow = phase === 'timeout';
  return (
    <div aria-busy="true" data-loading-phase={phase} className={slow ? 'flex flex-col gap-4' : undefined}>
      <span className="sr-only" role="status">
        {slow ? 'Still loading. Your connection seems slow.' : label}
      </span>
      {phase === 'skeleton' || slow ? (
        skeleton
      ) : (
        <div className="invisible" aria-hidden="true">
          {skeleton}
        </div>
      )}
      {slow ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-card px-4 py-3" data-slot="slow-notice">
          <p className="m-0 min-w-0 flex-1 text-body-sm text-ink-secondary" aria-hidden="true">
            Still loading. Your connection seems slow.
          </p>
          {onRetry ? (
            <Button variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
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

/** Lecturer lesson list (UI_FEEDBACK skeleton table): rows with a handle block, title line and status chip. */
export function LessonListSkeleton({ rows = 5 }) {
  return (
    <div data-skeleton="lesson-list" className="flex flex-col divide-y divide-hairline rounded-md border border-hairline bg-card">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-3">
          <Skeleton className="h-8 w-5" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton shape="chip" />
        </div>
      ))}
    </div>
  );
}

/** Lesson page: title, text lines, then the audio player's bars and controls. */
/** The submission screen (UI_FEEDBACK.md): instruction lines, the response-type selector, a large input block. */
export function SubmissionSkeleton() {
  return (
    <div data-skeleton="submission" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton shape="chip" className="w-32" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4">
        {['w-full', 'w-11/12', 'w-4/5', 'w-2/3'].map((w, i) => (
          <Skeleton key={i} className={w} />
        ))}
      </div>
      <div className="flex gap-1 self-start rounded-full bg-fill p-1">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} shape="button" className="w-24" />
        ))}
      </div>
      <Skeleton shape="card" className="h-48 w-full" />
    </div>
  );
}

export function LessonPageSkeleton() {
  return (
    <div data-skeleton="lesson-page" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-3/4" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4">
        <div className="flex h-14 items-center gap-0.5 overflow-hidden">
          {Array.from({ length: 48 }, (_, i) => (
            <Skeleton key={i} className="w-1 flex-none" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
          ))}
        </div>
        <div className="flex items-center justify-center gap-4">
          <Skeleton shape="circle" className="size-11" />
          <Skeleton shape="circle" className="size-14" />
          <Skeleton shape="circle" className="size-11" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-2/3'].map((w, i) => (
          <Skeleton key={i} className={w} />
        ))}
      </div>
    </div>
  );
}

/** Grading screen (UI_FEEDBACK.md): the learner header, the submission area block and a grading panel with field blocks; two panes from tablet width. */
export function GradingSkeleton() {
  return (
    <div data-skeleton="grading" className="flex flex-col gap-6">
      <Skeleton className="h-3 w-40" />
      <div className="flex items-center gap-4 rounded-lg border border-hairline bg-card p-4">
        <Skeleton shape="circle" className="size-14" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="flex flex-col gap-6 md:grid md:grid-cols-grading md:items-start">
        <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4">
          {['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-2/3'].map((w, i) => (
            <Skeleton key={i} className={w} />
          ))}
          <Skeleton shape="card" className="h-16 w-full" />
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-card p-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton shape="field" className="w-full" />
          <Skeleton shape="card" className="h-36 w-full" />
          <div className="flex gap-2 self-end">
            <Skeleton shape="button" className="w-28" />
            <Skeleton shape="button" className="w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Assignment results (UI_FEEDBACK.md results table): the count tiles, the search and filters, and the rows. */
export function ResultsSkeleton() {
  return (
    <div data-skeleton="results" className="flex flex-col gap-4">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} shape="card" className="h-24 w-full" />
        ))}
      </div>
      <Skeleton shape="field" className="w-full sm:w-80" />
      <ListSkeleton rows={6} columns={4} />
    </div>
  );
}

/** The course gradebook (Phase 10): the toolbar, then learner cards on phones or the matrix with a sticky learner column. */
export function GradebookSkeleton() {
  const rows = Array.from({ length: 5 }, (_, i) => i);
  const cols = Array.from({ length: 4 }, (_, i) => i);
  return (
    <div data-skeleton="gradebook" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="w-48" />
        <div className="flex gap-2">
          <Skeleton shape="button" className="w-40" />
          <Skeleton shape="button" className="w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.map((i) => (
          <div key={i} className="flex items-start gap-3 rounded-md border border-hairline bg-card p-4">
            <Skeleton shape="circle" className="size-10" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton shape="chip" />
            </div>
            <Skeleton shape="chip" />
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-md border border-hairline bg-card sm:block">
        {[-1, ...rows].map((i) => (
          <div key={i} className="flex h-16 items-center gap-4 border-t border-hairline px-4 first:border-t-0">
            <div className="flex min-w-gradebook-learner items-center gap-3">
              {i < 0 ? null : <Skeleton shape="circle" className="size-10" />}
              <Skeleton className="w-32" />
            </div>
            {cols.map((c) => (
              <Skeleton key={c} className="flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Notifications (UI_FEEDBACK.md): list rows with a small circle and two text lines. @param {{ rows?: number }} props */
export function NotificationsSkeleton({ rows = 6 }) {
  return (
    <div data-skeleton="notifications" className="overflow-hidden rounded-md border border-hairline bg-card">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 border-t border-hairline px-4 py-3 first:border-t-0">
          <Skeleton shape="circle" className="size-2.5" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="w-1/2" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}
