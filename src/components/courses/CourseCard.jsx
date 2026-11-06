import { BookOpen } from 'lucide-react';
import { Link } from 'react-router';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE } from '@/lib/courses/courses.js';

// A course in a card grid (prototype `cv`, lecturer and learner My Courses): cover or a tinted
// emblem tile, title, code, status chips. The whole card is one link with a 44 px+ target.

/**
 * @param {{ to: string, title: string, code: string, coverUrl?: string, chips: Array<{ label: string, tone?: 'success' | 'warning' | 'neutral' | 'info' }> }} props
 */
export function CourseCard({ to, title, code, coverUrl, chips }) {
  return (
    <Link to={to} className="group flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-card focus-visible:focus-ring">
      <div className="relative aspect-video w-full bg-fill">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="flex size-full items-center justify-center bg-hero-soft text-link">
            <BookOpen className="size-10" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-headline text-ink group-hover:underline">{title}</span>
        <span className="text-body-sm text-ink-secondary">{code}</span>
        <span className="mt-auto flex flex-wrap gap-2 pt-1">
          {chips.map((c) => (
            <StatusChip key={c.label} tone={c.tone}>
              {c.label}
            </StatusChip>
          ))}
        </span>
      </div>
    </Link>
  );
}

/** @param {import('@/lib/courses/courses.js').CourseStatus} status */
export function courseStatusChip(status) {
  return { label: COURSE_STATUS_LABEL[status], tone: COURSE_STATUS_TONE[status] };
}
