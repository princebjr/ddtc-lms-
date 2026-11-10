import { Link } from 'react-router';
import { CourseCover } from '@/components/courses/CourseCover.jsx';
import { StatusChip } from '@/components/ui/status-chip.jsx';
import { COURSE_STATUS_LABEL, COURSE_STATUS_TONE } from '@/lib/courses/courses.js';

// A course in a card grid (prototype `cv`, lecturer and learner My Courses): cover or a tinted
// emblem tile (the cover always cropped to 16:9, CourseCover), title, code, status chips. The whole
// card is one link with a 44 px+ target.

/**
 * @param {{ to: string, title: string, code: string, coverUrl?: string, chips: Array<{ label: string, tone?: 'success' | 'warning' | 'neutral' | 'info' }> }} props
 */
export function CourseCard({ to, title, code, coverUrl, chips }) {
  return (
    <Link to={to} className="group flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-card focus-visible:focus-ring">
      <CourseCover url={coverUrl} />
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
